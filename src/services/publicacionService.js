// Punto 3: listado, buscador, filtros combinados y ordenamiento.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const {
  toPublicacionListadoDto,
  toPublicacionDetalleDto,
  toPaginaDto,
  toCategoriaDto,
} = require('../dtos/publicacionDto');
const { toAccionesDto } = require('../dtos/interaccionDto');

const LIMITE_POR_DEFECTO = 20;
const LIMITE_MAXIMO = 50;

const ESTADOS_ARTICULO = ['NUEVO', 'COMO_NUEVO', 'USADO'];

// Los ordenamientos que pide el enunciado. Es un diccionario cerrado a
// propósito: nunca se interpola texto del usuario en el ORDER BY, que es
// por donde se cuela una inyección SQL (los parámetros ? no sirven ahí).
const ORDENES = {
  recientes: 'p.creado_en DESC',
  precio_asc: 'p.precio ASC',
  precio_desc: 'p.precio DESC',
  cercania: null, // se arma aparte, necesita las coordenadas del usuario
};

// SELECT común del listado: trae el nombre de la categoría y de la zona, la
// primera foto y cuántas tiene, todo en una sola consulta.
const SELECT_LISTADO = `
  SELECT p.id, p.titulo, p.precio, p.estado_articulo, p.estado,
         p.creado_en, p.categoria_id, p.zona_id,
         c.nombre AS categoria_nombre,
         z.nombre AS zona_nombre,
         (SELECT f.url FROM fotos_publicacion f
           WHERE f.publicacion_id = p.id ORDER BY f.orden, f.id LIMIT 1) AS foto_principal,
         (SELECT COUNT(*) FROM fotos_publicacion f
           WHERE f.publicacion_id = p.id) AS cantidad_fotos
    FROM publicaciones p
    JOIN categorias c ON c.id = p.categoria_id
    JOIN zonas z      ON z.id = p.zona_id
`;

// ---------------------------------------------------------------
// Lectura y validación de los parámetros del listado
// ---------------------------------------------------------------
function leerEntero(valor, nombre) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isInteger(n)) {
    throw ApiError.badRequest(`${nombre} tiene que ser un número entero`, 'PARAMETRO_INVALIDO');
  }
  return n;
}

function leerDecimal(valor, nombre) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (Number.isNaN(n) || n < 0) {
    throw ApiError.badRequest(`${nombre} tiene que ser un número mayor o igual a 0`, 'PARAMETRO_INVALIDO');
  }
  return n;
}

function leerPaginado(query) {
  const pagina = leerEntero(query.pagina, 'pagina') ?? 1;
  let limite = leerEntero(query.limite, 'limite') ?? LIMITE_POR_DEFECTO;

  if (pagina < 1) {
    throw ApiError.badRequest('La página empieza en 1', 'PAGINA_INVALIDA');
  }
  if (limite < 1) {
    throw ApiError.badRequest('El límite tiene que ser al menos 1', 'LIMITE_INVALIDO');
  }
  // Tope duro: sin esto, alguien pide limite=100000 y se lleva la tabla entera.
  if (limite > LIMITE_MAXIMO) limite = LIMITE_MAXIMO;

  return { pagina, limite, offset: (pagina - 1) * limite };
}

/**
 * Traduce los filtros de la query a condiciones WHERE + sus parámetros.
 * Todos los valores van como ? — nunca concatenados — así que no hay
 * forma de inyectar SQL desde la app.
 */
function armarFiltros(query) {
  const condiciones = [];
  const parametros = [];

  // Por defecto el Home muestra sólo lo que se puede comprar.
  const estado = query.estado ?? 'ACTIVA';
  if (estado !== 'TODAS') {
    condiciones.push('p.estado = ?');
    parametros.push(estado);
  }

  // Buscador por texto libre sobre título y descripción.
  const texto = String(query.q ?? '').trim();
  if (texto !== '') {
    condiciones.push('(p.titulo LIKE ? OR p.descripcion LIKE ?)');
    const patron = `%${texto}%`;
    parametros.push(patron, patron);
  }

  const categoriaId = leerEntero(query.categoriaId, 'categoriaId');
  if (categoriaId !== null) {
    condiciones.push('p.categoria_id = ?');
    parametros.push(categoriaId);
  }

  const precioMin = leerDecimal(query.precioMin, 'precioMin');
  const precioMax = leerDecimal(query.precioMax, 'precioMax');
  if (precioMin !== null && precioMax !== null && precioMin > precioMax) {
    throw ApiError.badRequest(
      'El precio mínimo no puede ser mayor que el máximo',
      'RANGO_PRECIO_INVALIDO'
    );
  }
  if (precioMin !== null) {
    condiciones.push('p.precio >= ?');
    parametros.push(precioMin);
  }
  if (precioMax !== null) {
    condiciones.push('p.precio <= ?');
    parametros.push(precioMax);
  }

  if (query.estadoArticulo) {
    // Admite varios separados por coma: estadoArticulo=NUEVO,COMO_NUEVO
    const estados = String(query.estadoArticulo)
      .split(',')
      .map((e) => e.trim().toUpperCase())
      .filter(Boolean);

    for (const e of estados) {
      if (!ESTADOS_ARTICULO.includes(e)) {
        throw ApiError.badRequest(
          `El estado del artículo debe ser uno de: ${ESTADOS_ARTICULO.join(', ')}`,
          'ESTADO_ARTICULO_INVALIDO'
        );
      }
    }
    if (estados.length > 0) {
      condiciones.push(`p.estado_articulo IN (${estados.map(() => '?').join(', ')})`);
      parametros.push(...estados);
    }
  }

  const zonaId = leerEntero(query.zonaId, 'zonaId');
  if (zonaId !== null) {
    condiciones.push('p.zona_id = ?');
    parametros.push(zonaId);
  }

  const vendedorId = leerEntero(query.vendedorId, 'vendedorId');
  if (vendedorId !== null) {
    condiciones.push('p.vendedor_id = ?');
    parametros.push(vendedorId);
  }

  return { condiciones, parametros };
}

/**
 * Ordenamiento por cercanía a la zona del usuario.
 *
 * Usa la fórmula del haversine simplificada: a las distancias de una ciudad
 * alcanza con tratar la Tierra como un plano. No hace falta precisión de
 * GPS, sólo saber qué está más cerca que qué.
 */
function ordenPorCercania(coordenadas, parametros) {
  parametros.push(coordenadas.latitud, coordenadas.longitud);
  return `(POW(z.latitud - ?, 2) + POW(z.longitud - ?, 2)) ASC, p.creado_en DESC`;
}

async function coordenadasDelUsuario(usuarioId) {
  if (!usuarioId) return null;
  const [filas] = await pool.query(
    `SELECT z.latitud, z.longitud
       FROM usuarios u JOIN zonas z ON z.id = u.zona_id
      WHERE u.id = ? LIMIT 1`,
    [usuarioId]
  );
  return filas[0] ?? null;
}

// ---------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------

// GET /api/publicaciones
async function listar(query, usuarioId = null) {
  const { pagina, limite, offset } = leerPaginado(query);
  const { condiciones, parametros } = armarFiltros(query);

  const orden = String(query.orden ?? 'recientes');
  if (!(orden in ORDENES)) {
    throw ApiError.badRequest(
      `El orden debe ser uno de: ${Object.keys(ORDENES).join(', ')}`,
      'ORDEN_INVALIDO'
    );
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  // El total se cuenta con los mismos filtros pero sin ordenar ni paginar.
  const [filasTotal] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM publicaciones p
       JOIN categorias c ON c.id = p.categoria_id
       JOIN zonas z      ON z.id = p.zona_id
       ${where}`,
    parametros
  );
  const total = Number(filasTotal[0].total);

  // Los parámetros del ORDER BY van después de los del WHERE: el orden en
  // que se agregan al array tiene que coincidir con el de la consulta.
  const parametrosConsulta = [...parametros];
  let orderBy = ORDENES[orden];

  if (orden === 'cercania') {
    const coordenadas = await coordenadasDelUsuario(usuarioId);
    if (!coordenadas) {
      throw ApiError.badRequest(
        'Para ordenar por cercanía tenés que tener una zona configurada en tu perfil',
        'SIN_ZONA_CONFIGURADA'
      );
    }
    orderBy = ordenPorCercania(coordenadas, parametrosConsulta);
  }

  const [filas] = await pool.query(
    `${SELECT_LISTADO} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...parametrosConsulta, limite, offset]
  );

  return toPaginaDto(filas.map(toPublicacionListadoDto), { pagina, limite, total });
}

// GET /api/categorias
async function listarCategorias() {
  const [filas] = await pool.query('SELECT * FROM categorias ORDER BY nombre');
  return { categorias: filas.map(toCategoriaDto) };
}

/** Publicaciones activas de una persona, para el perfil público del Punto 2. */
async function publicacionesActivasDe(vendedorId, limite = 10) {
  const [filas] = await pool.query(
    `${SELECT_LISTADO} WHERE p.vendedor_id = ? AND p.estado = 'ACTIVA'
      ORDER BY p.creado_en DESC LIMIT ?`,
    [vendedorId, limite]
  );
  return filas.map(toPublicacionListadoDto);
}

// GET /api/publicaciones/:id
// El detalle es publico, pero cambia segun quien mira: por eso recibe un
// usuarioId que puede ser null (lo deja autenticarOpcional).
async function obtenerDetalle(publicacionId, usuarioId = null) {
  const id = Number(publicacionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de publicación no es válido', 'ID_INVALIDO');
  }

  const [filas] = await pool.query(
    `SELECT p.*, c.nombre AS categoria_nombre, z.nombre AS zona_nombre
       FROM publicaciones p
       JOIN categorias c ON c.id = p.categoria_id
       JOIN zonas z      ON z.id = p.zona_id
      WHERE p.id = ? LIMIT 1`,
    [id]
  );
  const publicacion = filas[0];
  if (!publicacion) {
    throw ApiError.notFound('La publicación no existe', 'PUBLICACION_NO_ENCONTRADA');
  }

  // El vendedor con su reputacion, la galeria completa y el conteo de
  // preguntas van juntos: son independientes entre si.
  // Este require va adentro de la funcion a proposito: usuarioService ya
  // requiere a este modulo arriba de todo (para las publicaciones activas
  // del perfil publico). Pedirlo aca, recien al llamar, corta ese ciclo.
  const { obtenerReputacion } = require('./usuarioService');
  const [fotos, vendedorFilas, reputacion, contadores] = await Promise.all([
    pool.query(
      'SELECT id, url, orden FROM fotos_publicacion WHERE publicacion_id = ? ORDER BY orden, id',
      [id]
    ).then(([f]) => f),
    pool.query(
      `SELECT u.*, z.nombre AS zona_nombre
         FROM usuarios u LEFT JOIN zonas z ON z.id = u.zona_id
        WHERE u.id = ? LIMIT 1`,
      [publicacion.vendedor_id]
    ).then(([f]) => f),
    obtenerReputacion(publicacion.vendedor_id),
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM preguntas WHERE publicacion_id = ?) AS cantidad_preguntas,
         (SELECT COUNT(*) FROM ofertas   WHERE publicacion_id = ?) AS cantidad_ofertas`,
      [id, id]
    ).then(([f]) => f[0]),
  ]);

  const esVendedor = usuarioId !== null && publicacion.vendedor_id === usuarioId;

  const extras = {
    esMia: esVendedor,
    cantidadPreguntas: Number(contadores.cantidad_preguntas),
    // Cuantas ofertas hay solo le importa (y solo lo ve) el vendedor.
    cantidadOfertas: esVendedor ? Number(contadores.cantidad_ofertas) : null,
    acciones: toAccionesDto({
      esVendedor,
      autenticado: usuarioId !== null,
      publicacionActiva: publicacion.estado === 'ACTIVA',
    }),
  };

  return {
    publicacion: toPublicacionDetalleDto(
      publicacion,
      fotos,
      vendedorFilas[0],
      reputacion,
      extras
    ),
  };
}

module.exports = {
  listar,
  listarCategorias,
  publicacionesActivasDe,
  obtenerDetalle,
  SELECT_LISTADO,
  LIMITE_MAXIMO,
};

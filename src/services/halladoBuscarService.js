// CAPA DE SERVICIO: punto 3 de Hallado, el buscador y los resultados.
//
// La regla que define todo el punto
// ---------------------------------
// "La búsqueda devuelve las publicaciones del tipo opuesto: si perdiste algo,
// ves lo que otros encontraron, y viceversa."
//
// Por eso el parámetro se llama `queTePaso` y no `tipo`: la app manda lo que
// le pasó a la persona y el backend devuelve lo contrario. Si el parámetro
// fuera "tipo" alguien lo mandaría al derecho tarde o temprano, y el error
// sería invisible — se ven publicaciones, sólo que las equivocadas.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toPublicacionDto } = require('../dtos/halladoDto');
const { SELECT_PUBLICACION, buscarFotos } = require('./halladoPublicarService');

const TIPOS = ['PERDI', 'ENCONTRE'];
const OPUESTO = { PERDI: 'ENCONTRE', ENCONTRE: 'PERDI' };

const CUANDO = {
  HOY: 0,
  TRES_DIAS: 3,
  SEMANA: 7,
  // RANGO se maneja aparte: necesita desde y hasta.
};

const ORDENES = ['RECIENTES', 'CERCANOS'];

const LIMITE_DEFECTO = 20;
const LIMITE_MAXIMO = 50;
const Q_MAX = 80;

// Sólo se muestran las que todavía pueden resolverse. Una RESUELTA ya
// encontró a su dueño y una VENCIDA quedó sin renovar: mostrarlas llenaría
// los resultados de cosas que no llevan a ningún lado.
const ESTADOS_VISIBLES = "p.estado IN ('ABIERTA','EN_RECLAMO') AND p.vence_en >= NOW()";

function validarQueTePaso(valor) {
  const tipo = String(valor ?? '').trim().toUpperCase();
  if (!TIPOS.includes(tipo)) {
    throw ApiError.badRequest(
      `queTePaso debe ser uno de: ${TIPOS.join(', ')}`,
      'QUE_TE_PASO_INVALIDO'
    );
  }
  return tipo;
}

function validarOrden(valor) {
  const orden = String(valor ?? 'RECIENTES').trim().toUpperCase();
  if (!ORDENES.includes(orden)) {
    throw ApiError.badRequest(`El orden debe ser uno de: ${ORDENES.join(', ')}`, 'ORDEN_INVALIDO');
  }
  return orden;
}

function validarEntero(valor, { nombre, codigo, min, max, defecto }) {
  if (valor === undefined || valor === null || valor === '') return defecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < min || numero > max) {
    throw ApiError.badRequest(`${nombre} tiene que ser un número entre ${min} y ${max}`, codigo);
  }
  return numero;
}

function validarFecha(valor, nombre) {
  const texto = String(valor ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw ApiError.badRequest(`${nombre} tiene que venir como AAAA-MM-DD`, 'FECHA_INVALIDA');
  }
  return texto;
}

// Arma el pedazo de WHERE del "¿cuándo?" y sus parámetros.
function condicionDeFecha(filtros) {
  const cuando = String(filtros.cuando ?? '').trim().toUpperCase();
  if (cuando === '') return { sql: null, parametros: [] };

  if (cuando === 'RANGO') {
    const desde = validarFecha(filtros.desde, 'desde');
    const hasta = validarFecha(filtros.hasta, 'hasta');
    if (desde > hasta) {
      throw ApiError.badRequest('El rango empieza después de terminar', 'RANGO_INVALIDO');
    }
    return { sql: 'p.fecha_suceso BETWEEN ? AND ?', parametros: [desde, hasta] };
  }

  if (!(cuando in CUANDO)) {
    throw ApiError.badRequest(
      `cuando debe ser uno de: ${[...Object.keys(CUANDO), 'RANGO'].join(', ')}`,
      'CUANDO_INVALIDO'
    );
  }

  // CURDATE() y no NOW(): fecha_suceso es DATE, así que comparar con una
  // hora dejaría afuera todo lo de hoy.
  return {
    sql: 'p.fecha_suceso >= DATE_SUB(CURDATE(), INTERVAL ? DAY)',
    parametros: [CUANDO[cuando]],
  };
}

// Distancia en km con la fórmula del semiverseno.
//
// Se calcula en SQL y no en Node porque hay que ORDENAR por ella: traer todo
// a Node para ordenar ahí rompería el paginado.
const DISTANCIA_KM = `
  (6371 * ACOS(
    LEAST(1, GREATEST(-1,
      COS(RADIANS(?)) * COS(RADIANS(p.lat)) * COS(RADIANS(p.lng) - RADIANS(?))
      + SIN(RADIANS(?)) * SIN(RADIANS(p.lat))
    ))
  ))
`;

// GET /api/hallado/publicaciones
async function buscar(filtros = {}) {
  const queTePaso = validarQueTePaso(filtros.queTePaso);
  const orden = validarOrden(filtros.orden);
  const limite = validarEntero(filtros.limite, {
    nombre: 'limite', codigo: 'LIMITE_INVALIDO', min: 1, max: LIMITE_MAXIMO, defecto: LIMITE_DEFECTO,
  });
  const pagina = validarEntero(filtros.pagina, {
    nombre: 'pagina', codigo: 'PAGINA_INVALIDA', min: 1, max: 10000, defecto: 1,
  });

  const condiciones = [ESTADOS_VISIBLES, 'p.tipo = ?'];
  const parametros = [OPUESTO[queTePaso]];

  if (filtros.categoriaId) {
    condiciones.push('p.categoria_id = ?');
    parametros.push(validarEntero(filtros.categoriaId, {
      nombre: 'categoriaId', codigo: 'CATEGORIA_INVALIDA', min: 1, max: 1e6, defecto: null,
    }));
  }

  if (filtros.barrioId) {
    condiciones.push('p.barrio_id = ?');
    parametros.push(validarEntero(filtros.barrioId, {
      nombre: 'barrioId', codigo: 'BARRIO_INVALIDO', min: 1, max: 1e6, defecto: null,
    }));
  }

  // Palabras clave: busca en el título y en la descripción.
  const q = String(filtros.q ?? '').trim();
  if (q !== '') {
    if (q.length > Q_MAX) {
      throw ApiError.badRequest(`La búsqueda no puede tener más de ${Q_MAX} caracteres`, 'Q_LARGA');
    }
    // Los comodines se escapan: sin esto, buscar "100%" devuelve todo.
    const patron = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    condiciones.push('(p.titulo LIKE ? OR p.descripcion LIKE ?)');
    parametros.push(patron, patron);
  }

  const fecha = condicionDeFecha(filtros);
  if (fecha.sql) {
    condiciones.push(fecha.sql);
    parametros.push(...fecha.parametros);
  }

  // Ordenar por cercanía necesita desde dónde.
  let seleccionDistancia = 'NULL AS distancia_km';
  let parametrosDistancia = [];
  let sqlOrden = 'p.fecha_suceso DESC, p.id DESC';

  const hayCoordenadas = filtros.lat !== undefined && filtros.lng !== undefined
    && filtros.lat !== '' && filtros.lng !== '';

  if (hayCoordenadas) {
    const lat = Number(filtros.lat);
    const lng = Number(filtros.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw ApiError.badRequest('Las coordenadas no son válidas', 'COORDENADAS_INVALIDAS');
    }
    seleccionDistancia = `${DISTANCIA_KM} AS distancia_km`;
    parametrosDistancia = [lat, lng, lat];

    if (orden === 'CERCANOS') {
      // Las que no tienen coordenadas van al final: ordenar por una
      // distancia NULL las pondría primeras, que es lo contrario de lo que
      // pide "más cercanos".
      sqlOrden = 'p.lat IS NULL, distancia_km ASC, p.fecha_suceso DESC';
    }
  } else if (orden === 'CERCANOS') {
    throw ApiError.badRequest(
      'Para ordenar por cercanía hace falta mandar lat y lng',
      'FALTAN_COORDENADAS'
    );
  }

  const where = condiciones.join(' AND ');

  // El total va en una consulta aparte y no con SQL_CALC_FOUND_ROWS, que
  // está deprecado desde MySQL 8.0.17.
  const [filasTotal] = await pool.query(
    `SELECT COUNT(*) AS total FROM hallado_publicaciones p WHERE ${where}`,
    parametros
  );
  const total = filasTotal[0].total;

  const desplazamiento = (pagina - 1) * limite;
  const [filas] = await pool.query(
    `${SELECT_PUBLICACION.replace('SELECT p.*,', `SELECT p.*, ${seleccionDistancia},`)}
      WHERE ${where}
      ORDER BY ${sqlOrden}
      LIMIT ? OFFSET ?`,
    [...parametrosDistancia, ...parametros, limite, desplazamiento]
  );

  const fotosPorPublicacion = await buscarFotos(filas.map((f) => f.id));

  return {
    publicaciones: filas.map((fila) => ({
      // verDireccion en false: en los resultados NUNCA va la dirección
      // exacta. Recién se muestra con un reclamo aceptado (punto 4).
      ...toPublicacionDto(fila, fotosPorPublicacion.get(fila.id) ?? [], { verDireccion: false }),
      distanciaKm: fila.distancia_km === null ? null : Number(Number(fila.distancia_km).toFixed(2)),
    })),
    paginado: {
      pagina,
      limite,
      total,
      hayMas: desplazamiento + filas.length < total,
    },
  };
}

module.exports = { buscar };

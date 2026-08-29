// Punto 6: favoritos, búsquedas guardadas e indicadores de novedad.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toPublicacionListadoDto, toPaginaDto } = require('../dtos/publicacionDto');

const NOMBRE_BUSQUEDA_MAX = 60;
const BUSQUEDAS_MAX = 20;

// Sólo se guardan los filtros que el listado entiende. Cualquier otra clave
// se descarta: si no, alguien podría meter basura en la columna JSON.
const FILTROS_PERMITIDOS = [
  'q', 'categoriaId', 'precioMin', 'precioMax',
  'estadoArticulo', 'zonaId', 'orden',
];

/** MariaDB devuelve las columnas JSON como texto; MySQL ya parseadas. */
function parsearJson(valor) {
  if (typeof valor !== 'string') return valor;
  try {
    return JSON.parse(valor);
  } catch (error) {
    return {};
  }
}

async function buscarPublicacion(publicacionId) {
  const id = Number(publicacionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de publicación no es válido', 'ID_INVALIDO');
  }
  const [filas] = await pool.query(
    'SELECT id, precio FROM publicaciones WHERE id = ? LIMIT 1',
    [id]
  );
  if (filas.length === 0) {
    throw ApiError.notFound('La publicación no existe', 'PUBLICACION_NO_ENCONTRADA');
  }
  return filas[0];
}

// ---------------------------------------------------------------
// Favoritos
// ---------------------------------------------------------------

// POST /api/publicaciones/:id/favorito
async function marcarFavorito(publicacionId, usuarioId) {
  const publicacion = await buscarPublicacion(publicacionId);

  // Se guarda el precio del momento para poder detectar el cambio después.
  // ON DUPLICATE KEY: marcar dos veces no rompe, sólo refresca el precio.
  await pool.query(
    `INSERT INTO favoritos (usuario_id, publicacion_id, precio_al_guardar)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE precio_al_guardar = VALUES(precio_al_guardar)`,
    [usuarioId, publicacion.id, publicacion.precio]
  );

  return { mensaje: 'Guardada en favoritos', publicacionId: publicacion.id, esFavorito: true };
}

// DELETE /api/publicaciones/:id/favorito
async function quitarFavorito(publicacionId, usuarioId) {
  const publicacion = await buscarPublicacion(publicacionId);
  const [res] = await pool.query(
    'DELETE FROM favoritos WHERE usuario_id = ? AND publicacion_id = ?',
    [usuarioId, publicacion.id]
  );
  if (res.affectedRows === 0) {
    throw ApiError.notFound('Esa publicación no estaba en tus favoritos', 'NO_ERA_FAVORITO');
  }
  return { mensaje: 'Quitada de favoritos', publicacionId: publicacion.id, esFavorito: false };
}

/**
 * GET /api/favoritos
 *
 * Además de la publicación, cada ítem trae la novedad que pide el enunciado:
 * si el precio bajó o subió desde que se guardó, y de cuánto era antes.
 */
async function listarFavoritos(usuarioId, query) {
  const { SELECT_LISTADO } = require('./publicacionService');

  const pagina = Math.max(1, Number(query.pagina) || 1);
  const limite = Math.min(50, Math.max(1, Number(query.limite) || 20));
  const offset = (pagina - 1) * limite;

  const [filasTotal] = await pool.query(
    'SELECT COUNT(*) AS total FROM favoritos WHERE usuario_id = ?',
    [usuarioId]
  );

  const [filas] = await pool.query(
    `${SELECT_LISTADO}
       JOIN favoritos fav ON fav.publicacion_id = p.id AND fav.usuario_id = ?
      ORDER BY fav.creado_en DESC
      LIMIT ? OFFSET ?`,
    [usuarioId, limite, offset]
  );

  // El precio guardado se pide aparte para no ensuciar el SELECT compartido.
  const [precios] = await pool.query(
    'SELECT publicacion_id, precio_al_guardar, creado_en FROM favoritos WHERE usuario_id = ?',
    [usuarioId]
  );
  const guardados = new Map(precios.map((f) => [f.publicacion_id, f]));

  const items = filas.map((fila) => {
    const dto = toPublicacionListadoDto(fila);
    const guardado = guardados.get(fila.id);
    const precioAnterior = guardado ? Number(guardado.precio_al_guardar) : dto.precio;
    const cambio = dto.precio - precioAnterior;

    return {
      ...dto,
      esFavorito: true,
      guardadoEn: guardado ? guardado.creado_en : null,
      novedad: {
        // Los tres campos que necesita la app para el indicador visual.
        cambioDePrecio: cambio !== 0,
        precioAnterior,
        bajoDePrecio: cambio < 0,
      },
    };
  });

  const conNovedad = items.filter((i) => i.novedad.cambioDePrecio).length;

  return {
    ...toPaginaDto(items, { pagina, limite, total: Number(filasTotal[0].total) }),
    cantidadConNovedad: conNovedad,
  };
}

/** Marca cuáles de una lista de publicaciones son favoritas de esta persona. */
async function idsFavoritos(usuarioId, publicacionIds) {
  if (!usuarioId || publicacionIds.length === 0) return new Set();
  const [filas] = await pool.query(
    `SELECT publicacion_id FROM favoritos
      WHERE usuario_id = ? AND publicacion_id IN (${publicacionIds.map(() => '?').join(', ')})`,
    [usuarioId, ...publicacionIds]
  );
  return new Set(filas.map((f) => f.publicacion_id));
}

// ---------------------------------------------------------------
// Búsquedas guardadas
// ---------------------------------------------------------------
function limpiarFiltros(filtros) {
  if (!filtros || typeof filtros !== 'object') {
    throw ApiError.badRequest('Mandá los filtros en un objeto', 'FILTROS_INVALIDOS');
  }
  const limpios = {};
  for (const clave of FILTROS_PERMITIDOS) {
    if (filtros[clave] !== undefined && filtros[clave] !== null && filtros[clave] !== '') {
      limpios[clave] = filtros[clave];
    }
  }
  if (Object.keys(limpios).length === 0) {
    throw ApiError.badRequest(
      'La búsqueda no tiene ningún filtro que guardar',
      'BUSQUEDA_SIN_FILTROS'
    );
  }
  return limpios;
}

// POST /api/busquedas-guardadas
async function guardarBusqueda(usuarioId, { nombre, filtros }) {
  const nombreLimpio = String(nombre ?? '').trim();
  if (nombreLimpio === '') {
    throw ApiError.badRequest('Poné un nombre a la búsqueda', 'NOMBRE_REQUERIDO');
  }
  if (nombreLimpio.length > NOMBRE_BUSQUEDA_MAX) {
    throw ApiError.badRequest(
      `El nombre no puede tener más de ${NOMBRE_BUSQUEDA_MAX} caracteres`,
      'NOMBRE_LARGO'
    );
  }

  const limpios = limpiarFiltros(filtros);

  const [cuantas] = await pool.query(
    'SELECT COUNT(*) AS total FROM busquedas_guardadas WHERE usuario_id = ?',
    [usuarioId]
  );
  if (Number(cuantas[0].total) >= BUSQUEDAS_MAX) {
    throw ApiError.conflict(
      `No podés tener más de ${BUSQUEDAS_MAX} búsquedas guardadas`,
      'DEMASIADAS_BUSQUEDAS'
    );
  }

  try {
    const [res] = await pool.query(
      'INSERT INTO busquedas_guardadas (usuario_id, nombre, filtros) VALUES (?, ?, ?)',
      [usuarioId, nombreLimpio, JSON.stringify(limpios)]
    );
    return {
      mensaje: 'Búsqueda guardada',
      busqueda: { id: res.insertId, nombre: nombreLimpio, filtros: limpios, novedades: 0 },
    };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw ApiError.conflict('Ya tenés una búsqueda con ese nombre', 'NOMBRE_EN_USO');
    }
    throw error;
  }
}

/**
 * Cuántas publicaciones nuevas coinciden con los filtros de una búsqueda
 * desde la última vez que la persona la miró.
 *
 * Reusa exactamente el mismo armado de condiciones que el listado, así que
 * una búsqueda guardada siempre cuenta lo mismo que devolvería el Home.
 */
async function contarNovedades(busqueda) {
  const { armarCondicionesDeFiltro } = require('./publicacionService');
  const filtros = parsearJson(busqueda.filtros);

  const { condiciones, parametros } = armarCondicionesDeFiltro(filtros);
  condiciones.push('p.creado_en > ?');
  parametros.push(busqueda.ultimo_visto_en);

  const [filas] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM publicaciones p
       JOIN categorias c ON c.id = p.categoria_id
       JOIN zonas z      ON z.id = p.zona_id
      WHERE ${condiciones.join(' AND ')}`,
    parametros
  );
  return Number(filas[0].total);
}

// GET /api/busquedas-guardadas
async function listarBusquedas(usuarioId) {
  const [filas] = await pool.query(
    'SELECT * FROM busquedas_guardadas WHERE usuario_id = ? ORDER BY creado_en DESC',
    [usuarioId]
  );

  const busquedas = await Promise.all(
    filas.map(async (fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      filtros: parsearJson(fila.filtros),
      // El indicador de novedad de la sección.
      novedades: await contarNovedades(fila),
      ultimoVistoEn: fila.ultimo_visto_en,
      creadoEn: fila.creado_en,
    }))
  );

  return {
    busquedas,
    totalNovedades: busquedas.reduce((suma, b) => suma + b.novedades, 0),
  };
}

/**
 * GET /api/busquedas-guardadas/:id/resultados
 * Corre la búsqueda y, de paso, marca que ya la vio: el indicador se apaga.
 */
async function ejecutarBusqueda(usuarioId, busquedaId, query) {
  const [filas] = await pool.query(
    'SELECT * FROM busquedas_guardadas WHERE id = ? AND usuario_id = ? LIMIT 1',
    [Number(busquedaId), usuarioId]
  );
  const busqueda = filas[0];
  if (!busqueda) {
    throw ApiError.notFound('Esa búsqueda no existe', 'BUSQUEDA_NO_ENCONTRADA');
  }

  const { listar } = require('./publicacionService');
  const filtros = { ...parsearJson(busqueda.filtros), ...query };
  const resultados = await listar(filtros, usuarioId);

  // NOW(3) y no NOW(): la columna tiene milisegundos, y NOW() a secas los
  // trunca. Con el valor truncado, algo publicado en ese mismo segundo
  // seguiria contando como novedad para siempre.
  await pool.query(
    'UPDATE busquedas_guardadas SET ultimo_visto_en = NOW(3) WHERE id = ?',
    [busqueda.id]
  );

  return { busqueda: { id: busqueda.id, nombre: busqueda.nombre, filtros }, ...resultados };
}

// DELETE /api/busquedas-guardadas/:id
async function eliminarBusqueda(usuarioId, busquedaId) {
  const [res] = await pool.query(
    'DELETE FROM busquedas_guardadas WHERE id = ? AND usuario_id = ?',
    [Number(busquedaId), usuarioId]
  );
  if (res.affectedRows === 0) {
    throw ApiError.notFound('Esa búsqueda no existe', 'BUSQUEDA_NO_ENCONTRADA');
  }
  return { mensaje: 'Búsqueda eliminada', id: Number(busquedaId) };
}

module.exports = {
  marcarFavorito,
  quitarFavorito,
  listarFavoritos,
  idsFavoritos,
  guardarBusqueda,
  listarBusquedas,
  ejecutarBusqueda,
  eliminarBusqueda,
};

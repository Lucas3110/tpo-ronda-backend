// CAPA DE SERVICIO: punto 4 de Hallado, seguir una publicación.
//
// "Cualquier persona puede seguir la publicación para enterarse de sus
// novedades." Acá vive el seguir y el dejar de seguir (punto 4), y también
// la sección "Seguidas" del punto 9, que lee la misma tabla.
//
// Novedad = la publicación cambió de estado desde la última vez que la
// persona la miró: el estado actual (con VENCIDA calculada) es distinto de
// estado_visto. Si pasó de ABIERTA a EN_RECLAMO y volvió a ABIERTA sin que
// la persona mirara, no hay novedad: para ella nada cambió.
//
// Las dos operaciones son idempotentes a propósito: seguir dos veces deja
// una sola fila, y dejar de seguir algo que no se seguía no es un error. Con
// un celular que reintenta un pedido que se cortó, lo contrario daría un
// "ya la seguís" por un toque que la persona no repitió.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toSeguidaDto } = require('../dtos/halladoDto');
const { SELECT_PUBLICACION, buscarFotos } = require('./halladoPublicarService');
const { vencerReclamos } = require('./halladoReclamoService');

const ESTADO_EFECTIVO = "IF(p.estado = 'ABIERTA' AND p.vence_en < NOW(), 'VENCIDA', p.estado)";

function validarId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de la publicación no es válido', 'ID_INVALIDO');
  }
  return id;
}

async function buscarPublicacion(id) {
  const [filas] = await pool.query(
    `SELECT id, usuario_id,
            IF(estado = 'ABIERTA' AND vence_en < NOW(), 'VENCIDA', estado) AS estado_efectivo
       FROM hallado_publicaciones
      WHERE id = ? LIMIT 1`,
    [id]
  );
  if (filas.length === 0) {
    throw ApiError.notFound('Esa publicación no existe', 'PUBLICACION_NO_ENCONTRADA');
  }
  return filas[0];
}

// Cómo está el seguimiento entre una persona y una publicación. Lo usa el
// detalle para pintar el botón, y las dos operaciones para contestar.
async function estadoDeSeguimiento(publicacionId, usuarioId) {
  const [filas] = await pool.query(
    `SELECT
        (SELECT COUNT(*) FROM hallado_seguidas WHERE publicacion_id = ?) AS seguidores,
        (SELECT COUNT(*) FROM hallado_seguidas WHERE publicacion_id = ? AND usuario_id = ?) AS la_sigo`,
    [publicacionId, publicacionId, usuarioId ?? 0]
  );
  return {
    laSigo: usuarioId !== null && Number(filas[0].la_sigo) > 0,
    seguidores: Number(filas[0].seguidores),
  };
}

// POST /api/hallado/publicaciones/:id/seguir
async function seguir(publicacionId, usuarioId) {
  const id = validarId(publicacionId);
  const publicacion = await buscarPublicacion(id);

  // Seguir lo propio no informa nada: las novedades de tu publicación ya
  // te llegan por ser el publicador.
  if (publicacion.usuario_id === usuarioId) {
    throw ApiError.badRequest('Es tu propia publicación', 'ES_TU_PUBLICACION');
  }

  // INSERT IGNORE y no INSERT: si ya la seguía, no pasa nada.
  await pool.query(
    'INSERT IGNORE INTO hallado_seguidas (usuario_id, publicacion_id, estado_visto) VALUES (?, ?, ?)',
    [usuarioId, id, publicacion.estado_efectivo]
  );

  return estadoDeSeguimiento(id, usuarioId);
}

// DELETE /api/hallado/publicaciones/:id/seguir
async function dejarDeSeguir(publicacionId, usuarioId) {
  const id = validarId(publicacionId);
  await buscarPublicacion(id);

  await pool.query(
    'DELETE FROM hallado_seguidas WHERE usuario_id = ? AND publicacion_id = ?',
    [usuarioId, id]
  );

  return estadoDeSeguimiento(id, usuarioId);
}

// GET /api/hallado/seguidas
//
// Todas, en cualquier estado: a quien sigue algo le interesa justamente
// enterarse de que se resolvió o venció. Primero las que tienen novedad.
async function listarSeguidas(usuarioId) {
  // Un reclamo vencido devuelve la publicación a ABIERTA: sin esto, la lista
  // mostraría EN_RECLAMO en algo que ya no lo está.
  await vencerReclamos();

  const [filas] = await pool.query(
    `${SELECT_PUBLICACION.replace('SELECT p.*,', 'SELECT p.*, s.estado_visto, s.creado_en AS seguida_desde,')}
       JOIN hallado_seguidas s ON s.publicacion_id = p.id AND s.usuario_id = ?
      ORDER BY (${ESTADO_EFECTIVO} <> s.estado_visto) DESC, s.creado_en DESC, p.id DESC`,
    [usuarioId]
  );
  const fotosPorPublicacion = await buscarFotos(filas.map((f) => f.id));
  const seguidas = filas.map((fila) => toSeguidaDto(fila, fotosPorPublicacion.get(fila.id) ?? []));

  return {
    seguidas,
    conNovedad: seguidas.filter((s) => s.hayNovedad).length,
  };
}

// La persona vio el estado actual: se apaga la novedad. Lo llama el detalle
// (punto 4) cada vez que alguien abre una publicación que sigue, y no hace
// nada si no la sigue.
async function marcarVista(publicacionId, usuarioId, estadoActual) {
  if (usuarioId === null) return;
  await pool.query(
    `UPDATE hallado_seguidas SET estado_visto = ?
      WHERE usuario_id = ? AND publicacion_id = ? AND estado_visto <> ?`,
    [estadoActual, usuarioId, publicacionId, estadoActual]
  );
}

// Para el indicador general (GET /novedades).
async function contarConNovedad(usuarioId) {
  const [filas] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM hallado_seguidas s
       JOIN hallado_publicaciones p ON p.id = s.publicacion_id
      WHERE s.usuario_id = ? AND ${ESTADO_EFECTIVO} <> s.estado_visto`,
    [usuarioId]
  );
  return Number(filas[0].total);
}

module.exports = {
  seguir,
  dejarDeSeguir,
  estadoDeSeguimiento,
  listarSeguidas,
  marcarVista,
  contarConNovedad,
};

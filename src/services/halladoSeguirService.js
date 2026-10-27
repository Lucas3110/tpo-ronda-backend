// CAPA DE SERVICIO: punto 4 de Hallado, seguir una publicación.
//
// "Cualquier persona puede seguir la publicación para enterarse de sus
// novedades." Acá vive el seguir y el dejar de seguir. La lista de seguidas y
// el aviso de novedades son del punto 9, que lee la misma tabla.
//
// Las dos operaciones son idempotentes a propósito: seguir dos veces deja
// una sola fila, y dejar de seguir algo que no se seguía no es un error. Con
// un celular que reintenta un pedido que se cortó, lo contrario daría un
// "ya la seguís" por un toque que la persona no repitió.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

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

module.exports = { seguir, dejarDeSeguir, estadoDeSeguimiento };

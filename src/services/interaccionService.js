// Punto 4: preguntas y ofertas sobre una publicación.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toPreguntaDto, toOfertaDto } = require('../dtos/interaccionDto');

const TEXTO_MAX = 500;

/** Trae la publicación o corta con 404. Se usa antes de cualquier acción. */
async function buscarPublicacion(publicacionId) {
  const id = Number(publicacionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de publicación no es válido', 'ID_INVALIDO');
  }
  const [filas] = await pool.query(
    'SELECT id, vendedor_id, estado, precio FROM publicaciones WHERE id = ? LIMIT 1',
    [id]
  );
  if (filas.length === 0) {
    throw ApiError.notFound('La publicación no existe', 'PUBLICACION_NO_ENCONTRADA');
  }
  return filas[0];
}

function validarTexto(texto, campo, codigo) {
  const limpio = String(texto ?? '').trim();
  if (limpio === '') {
    throw ApiError.badRequest(`${campo} no puede estar vacío`, codigo);
  }
  if (limpio.length > TEXTO_MAX) {
    throw ApiError.badRequest(
      `${campo} no puede tener más de ${TEXTO_MAX} caracteres`,
      'TEXTO_LARGO'
    );
  }
  return limpio;
}

// ---------------------------------------------------------------
// Preguntas
// ---------------------------------------------------------------

// GET /api/publicaciones/:id/preguntas  (público)
async function listarPreguntas(publicacionId) {
  await buscarPublicacion(publicacionId);
  const [filas] = await pool.query(
    `SELECT p.*, u.nombre AS autor_nombre
       FROM preguntas p JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.publicacion_id = ?
      ORDER BY p.creado_en DESC`,
    [Number(publicacionId)]
  );
  return { preguntas: filas.map(toPreguntaDto) };
}

// POST /api/publicaciones/:id/preguntas
async function preguntar(publicacionId, usuarioId, texto) {
  const publicacion = await buscarPublicacion(publicacionId);

  if (publicacion.vendedor_id === usuarioId) {
    throw ApiError.forbidden(
      'No podés preguntar en tu propia publicación',
      'ES_TU_PUBLICACION'
    );
  }
  if (publicacion.estado !== 'ACTIVA') {
    throw ApiError.badRequest(
      'La publicación no está activa',
      'PUBLICACION_NO_ACTIVA'
    );
  }

  const limpio = validarTexto(texto, 'La pregunta', 'PREGUNTA_VACIA');
  const [res] = await pool.query(
    'INSERT INTO preguntas (publicacion_id, usuario_id, texto) VALUES (?, ?, ?)',
    [publicacion.id, usuarioId, limpio]
  );

  const [filas] = await pool.query(
    `SELECT p.*, u.nombre AS autor_nombre
       FROM preguntas p JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.id = ?`,
    [res.insertId]
  );
  return { pregunta: toPreguntaDto(filas[0]) };
}

// POST /api/preguntas/:id/respuesta  (sólo el vendedor)
async function responder(preguntaId, usuarioId, respuesta) {
  const [filas] = await pool.query(
    `SELECT p.*, pub.vendedor_id
       FROM preguntas p JOIN publicaciones pub ON pub.id = p.publicacion_id
      WHERE p.id = ? LIMIT 1`,
    [Number(preguntaId)]
  );
  const pregunta = filas[0];
  if (!pregunta) {
    throw ApiError.notFound('La pregunta no existe', 'PREGUNTA_NO_ENCONTRADA');
  }
  if (pregunta.vendedor_id !== usuarioId) {
    throw ApiError.forbidden('Sólo el vendedor puede responder', 'NO_SOS_EL_VENDEDOR');
  }
  if (pregunta.respuesta) {
    throw ApiError.conflict('Esa pregunta ya fue respondida', 'PREGUNTA_YA_RESPONDIDA');
  }

  const limpio = validarTexto(respuesta, 'La respuesta', 'RESPUESTA_VACIA');
  await pool.query(
    'UPDATE preguntas SET respuesta = ?, respondida_en = NOW() WHERE id = ?',
    [limpio, pregunta.id]
  );

  const [actualizada] = await pool.query(
    `SELECT p.*, u.nombre AS autor_nombre
       FROM preguntas p JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.id = ?`,
    [pregunta.id]
  );
  return { pregunta: toPreguntaDto(actualizada[0]) };
}

// ---------------------------------------------------------------
// Ofertas
// ---------------------------------------------------------------

/**
 * GET /api/publicaciones/:id/ofertas
 * El vendedor ve todas; un interesado ve sólo las suyas. Las ofertas ajenas
 * son información sensible: saberlas permitiría ofertar apenas por encima.
 */
async function listarOfertas(publicacionId, usuarioId) {
  const publicacion = await buscarPublicacion(publicacionId);
  const esVendedor = publicacion.vendedor_id === usuarioId;

  const [filas] = await pool.query(
    `SELECT o.*, u.nombre AS autor_nombre
       FROM ofertas o JOIN usuarios u ON u.id = o.usuario_id
      WHERE o.publicacion_id = ? ${esVendedor ? '' : 'AND o.usuario_id = ?'}
      ORDER BY o.creado_en DESC`,
    esVendedor ? [publicacion.id] : [publicacion.id, usuarioId]
  );
  return { ofertas: filas.map(toOfertaDto), esVendedor };
}

// POST /api/publicaciones/:id/ofertas
async function ofertar(publicacionId, usuarioId, monto) {
  const publicacion = await buscarPublicacion(publicacionId);

  if (publicacion.vendedor_id === usuarioId) {
    throw ApiError.forbidden(
      'No podés ofertar en tu propia publicación',
      'ES_TU_PUBLICACION'
    );
  }
  if (publicacion.estado !== 'ACTIVA') {
    throw ApiError.badRequest('La publicación no está activa', 'PUBLICACION_NO_ACTIVA');
  }

  const valor = Number(monto);
  if (Number.isNaN(valor) || valor <= 0) {
    throw ApiError.badRequest('La oferta tiene que ser mayor a 0', 'MONTO_INVALIDO');
  }
  if (valor > Number(publicacion.precio)) {
    throw ApiError.badRequest(
      'La oferta no puede superar el precio publicado',
      'OFERTA_MAYOR_AL_PRECIO'
    );
  }

  // Una oferta pendiente por persona: si ya hay, se reemplaza el monto.
  const [pendientes] = await pool.query(
    `SELECT id FROM ofertas
      WHERE publicacion_id = ? AND usuario_id = ? AND estado = 'PENDIENTE' LIMIT 1`,
    [publicacion.id, usuarioId]
  );

  let ofertaId;
  if (pendientes.length > 0) {
    ofertaId = pendientes[0].id;
    await pool.query('UPDATE ofertas SET monto = ?, creado_en = NOW() WHERE id = ?', [
      valor,
      ofertaId,
    ]);
  } else {
    const [res] = await pool.query(
      'INSERT INTO ofertas (publicacion_id, usuario_id, monto) VALUES (?, ?, ?)',
      [publicacion.id, usuarioId, valor]
    );
    ofertaId = res.insertId;
  }

  const [filas] = await pool.query(
    `SELECT o.*, u.nombre AS autor_nombre
       FROM ofertas o JOIN usuarios u ON u.id = o.usuario_id
      WHERE o.id = ?`,
    [ofertaId]
  );
  return { oferta: toOfertaDto(filas[0]) };
}

// PATCH /api/ofertas/:id  { estado: 'ACEPTADA' | 'RECHAZADA' }  (vendedor)
async function responderOferta(ofertaId, usuarioId, estado) {
  if (!['ACEPTADA', 'RECHAZADA'].includes(estado)) {
    throw ApiError.badRequest(
      'El estado debe ser ACEPTADA o RECHAZADA',
      'ESTADO_OFERTA_INVALIDO'
    );
  }

  const [filas] = await pool.query(
    `SELECT o.*, pub.vendedor_id
       FROM ofertas o JOIN publicaciones pub ON pub.id = o.publicacion_id
      WHERE o.id = ? LIMIT 1`,
    [Number(ofertaId)]
  );
  const oferta = filas[0];
  if (!oferta) {
    throw ApiError.notFound('La oferta no existe', 'OFERTA_NO_ENCONTRADA');
  }
  if (oferta.vendedor_id !== usuarioId) {
    throw ApiError.forbidden('Sólo el vendedor puede responder ofertas', 'NO_SOS_EL_VENDEDOR');
  }
  if (oferta.estado !== 'PENDIENTE') {
    throw ApiError.conflict('Esa oferta ya fue respondida', 'OFERTA_YA_RESPONDIDA');
  }

  await pool.query('UPDATE ofertas SET estado = ?, respondida_en = NOW() WHERE id = ?', [
    estado,
    oferta.id,
  ]);

  const [actualizada] = await pool.query(
    `SELECT o.*, u.nombre AS autor_nombre
       FROM ofertas o JOIN usuarios u ON u.id = o.usuario_id
      WHERE o.id = ?`,
    [oferta.id]
  );
  return { oferta: toOfertaDto(actualizada[0]) };
}

module.exports = {
  listarPreguntas,
  preguntar,
  responder,
  listarOfertas,
  ofertar,
  responderOferta,
  buscarPublicacion,
};

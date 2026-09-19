// Punto 4: preguntas y ofertas sobre una publicación.
// Punto 7: la negociación completa — mensaje, contraoferta y vencimiento.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const {
  toPreguntaDto,
  toOfertaDto,
  toOfertaConPublicacionDto,
} = require('../dtos/interaccionDto');

const TEXTO_MAX = 500;
const MENSAJE_MAX = 500;

// SELECT común de las ofertas: siempre queremos el nombre de quien propuso.
const SELECT_OFERTA = `
  SELECT o.*, u.nombre AS autor_nombre
    FROM ofertas o JOIN usuarios u ON u.id = o.usuario_id
`;

/**
 * Punto 7: "pasado el cual caduca automáticamente".
 *
 * Se resuelve con un barrido perezoso en vez de un cron: antes de leer o
 * tocar ofertas, las pendientes que ya pasaron su fecha se marcan VENCIDA.
 * Tiene dos ventajas sobre una tarea programada — no hay un proceso más que
 * mantener, y es imposible leer una oferta "pendiente" que en realidad
 * venció hace un rato. El índice (estado, expira_en) hace que el UPDATE no
 * recorra la tabla entera.
 */
async function vencerOfertasExpiradas() {
  await pool.query(
    `UPDATE ofertas SET estado = 'VENCIDA'
      WHERE estado = 'PENDIENTE' AND expira_en IS NOT NULL AND expira_en <= NOW()`
  );
}

/** El mensaje que puede acompañar a una oferta. Opcional por enunciado. */
function validarMensaje(mensaje) {
  if (mensaje === undefined || mensaje === null) return null;

  const limpio = String(mensaje).trim();
  if (limpio === '') return null;
  if (limpio.length > MENSAJE_MAX) {
    throw ApiError.badRequest(
      `El mensaje no puede tener más de ${MENSAJE_MAX} caracteres`,
      'MENSAJE_LARGO'
    );
  }
  return limpio;
}

function validarMonto(monto, precioPublicado) {
  const valor = Number(monto);
  if (Number.isNaN(valor) || valor <= 0) {
    throw ApiError.badRequest('La oferta tiene que ser mayor a 0', 'MONTO_INVALIDO');
  }
  if (valor > Number(precioPublicado)) {
    throw ApiError.badRequest(
      'La oferta no puede superar el precio publicado',
      'OFERTA_MAYOR_AL_PRECIO'
    );
  }
  return valor;
}

async function leerOferta(ofertaId) {
  const [filas] = await pool.query(`${SELECT_OFERTA} WHERE o.id = ?`, [ofertaId]);
  return filas[0];
}

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
// Ofertas y negociación (Puntos 4 y 7)
// ---------------------------------------------------------------

/**
 * GET /api/publicaciones/:id/ofertas
 * El vendedor ve todas; un interesado ve sólo las suyas. Las ofertas ajenas
 * son información sensible: saberlas permitiría ofertar apenas por encima.
 */
async function listarOfertas(publicacionId, usuarioId) {
  await vencerOfertasExpiradas();

  const publicacion = await buscarPublicacion(publicacionId);
  const esVendedor = publicacion.vendedor_id === usuarioId;

  // Al interesado le mostramos su hilo completo: las que propuso él y las
  // contraofertas que le hizo el vendedor sobre esas. Sin esto no vería el
  // precio que le contrapropusieron.
  const [filas] = await pool.query(
    `${SELECT_OFERTA}
      WHERE o.publicacion_id = ?
        ${esVendedor ? '' : 'AND (o.usuario_id = ? OR o.contraoferta_de_id IN (SELECT id FROM (SELECT id FROM ofertas WHERE publicacion_id = ? AND usuario_id = ?) AS mias))'}
      ORDER BY o.creado_en DESC`,
    esVendedor
      ? [publicacion.id]
      : [publicacion.id, usuarioId, publicacion.id, usuarioId]
  );
  return { ofertas: filas.map(toOfertaDto), esVendedor };
}

// POST /api/publicaciones/:id/ofertas   { monto, mensaje? }
async function ofertar(publicacionId, usuarioId, monto, mensaje) {
  await vencerOfertasExpiradas();

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

  const valor = validarMonto(monto, publicacion.precio);
  const texto = validarMensaje(mensaje);
  const horas = config.oferta.horasDeVigencia;

  // Una oferta pendiente por persona: si ya hay, se reemplaza el monto y se
  // reinicia el plazo. Volver a ofertar no acumula ofertas sueltas.
  const [pendientes] = await pool.query(
    `SELECT id FROM ofertas
      WHERE publicacion_id = ? AND usuario_id = ? AND estado = 'PENDIENTE'
        AND origen = 'COMPRADOR'
      LIMIT 1`,
    [publicacion.id, usuarioId]
  );

  let ofertaId;
  if (pendientes.length > 0) {
    ofertaId = pendientes[0].id;
    await pool.query(
      `UPDATE ofertas
          SET monto = ?, mensaje = ?, creado_en = NOW(),
              expira_en = DATE_ADD(NOW(), INTERVAL ? HOUR)
        WHERE id = ?`,
      [valor, texto, horas, ofertaId]
    );
  } else {
    const [res] = await pool.query(
      `INSERT INTO ofertas (publicacion_id, usuario_id, monto, mensaje, origen, expira_en)
       VALUES (?, ?, ?, ?, 'COMPRADOR', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [publicacion.id, usuarioId, valor, texto, horas]
    );
    ofertaId = res.insertId;
  }

  return { oferta: toOfertaDto(await leerOferta(ofertaId)) };
}

/**
 * PATCH /api/ofertas/:id   { estado: 'ACEPTADA' | 'RECHAZADA' }
 *
 * Quién puede responder depende de quién propuso: una oferta del comprador la
 * responde el vendedor, y una contraoferta del vendedor la responde el
 * comprador. Es lo que hace que la negociación sea de ida y vuelta.
 *
 * Aceptar cierra el trato: se registra la operación (que es de lo que vive el
 * historial del Punto 9), la publicación pasa a VENDIDA y el resto de las
 * ofertas de esa publicación se rechazan solas.
 */
async function responderOferta(ofertaId, usuarioId, estado) {
  if (!['ACEPTADA', 'RECHAZADA'].includes(estado)) {
    throw ApiError.badRequest(
      'El estado debe ser ACEPTADA o RECHAZADA',
      'ESTADO_OFERTA_INVALIDO'
    );
  }

  await vencerOfertasExpiradas();

  const [filas] = await pool.query(
    `SELECT o.*, pub.vendedor_id, pub.id AS pub_id
       FROM ofertas o JOIN publicaciones pub ON pub.id = o.publicacion_id
      WHERE o.id = ? LIMIT 1`,
    [Number(ofertaId)]
  );
  const oferta = filas[0];
  if (!oferta) {
    throw ApiError.notFound('La oferta no existe', 'OFERTA_NO_ENCONTRADA');
  }

  const leResponde =
    oferta.origen === 'COMPRADOR' ? oferta.vendedor_id : oferta.usuario_id;
  if (leResponde !== usuarioId) {
    throw ApiError.forbidden(
      oferta.origen === 'COMPRADOR'
        ? 'Sólo el vendedor puede responder esta oferta'
        : 'Sólo quien recibió la contraoferta puede responderla',
      'NO_TE_CORRESPONDE'
    );
  }
  if (oferta.estado === 'VENCIDA') {
    throw ApiError.conflict('Esa oferta ya venció', 'OFERTA_VENCIDA');
  }
  if (oferta.estado !== 'PENDIENTE') {
    throw ApiError.conflict('Esa oferta ya fue respondida', 'OFERTA_YA_RESPONDIDA');
  }

  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    await conexion.query(
      'UPDATE ofertas SET estado = ?, respondida_en = NOW() WHERE id = ?',
      [estado, oferta.id]
    );

    if (estado === 'ACEPTADA') {
      // El comprador es siempre el interesado, propusiera él el monto o
      // fuera una contraoferta que terminó aceptando.
      const compradorId = oferta.usuario_id;

      await conexion.query(
        `INSERT INTO operaciones (publicacion_id, vendedor_id, comprador_id, monto)
         VALUES (?, ?, ?, ?)`,
        [oferta.pub_id, oferta.vendedor_id, compradorId, oferta.monto]
      );

      // El artículo es uno solo: cerrada la venta, las demás ofertas de esa
      // publicación no tienen adónde ir.
      await conexion.query(
        `UPDATE ofertas SET estado = 'RECHAZADA', respondida_en = NOW()
          WHERE publicacion_id = ? AND estado = 'PENDIENTE' AND id <> ?`,
        [oferta.pub_id, oferta.id]
      );
      await conexion.query(
        `UPDATE publicaciones SET estado = 'VENDIDA' WHERE id = ?`,
        [oferta.pub_id]
      );
    }

    await conexion.commit();
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }

  return { oferta: toOfertaDto(await leerOferta(oferta.id)) };
}

/**
 * POST /api/ofertas/:id/contraoferta   { monto, mensaje? }
 *
 * Punto 7: "el vendedor puede [...] realizar una contraoferta con un nuevo
 * precio". La oferta original queda RECHAZADA (el vendedor no la aceptó) y
 * nace una nueva fila con origen VENDEDOR, encadenada por contraoferta_de_id.
 *
 * Modelarlo como una fila nueva y no como un UPDATE del monto conserva el
 * historial del regateo: se puede reconstruir toda la negociación siguiendo
 * la cadena.
 */
async function contraofertar(ofertaId, usuarioId, monto, mensaje) {
  await vencerOfertasExpiradas();

  const [filas] = await pool.query(
    `SELECT o.*, pub.vendedor_id, pub.precio AS publicacion_precio, pub.estado AS publicacion_estado
       FROM ofertas o JOIN publicaciones pub ON pub.id = o.publicacion_id
      WHERE o.id = ? LIMIT 1`,
    [Number(ofertaId)]
  );
  const original = filas[0];
  if (!original) {
    throw ApiError.notFound('La oferta no existe', 'OFERTA_NO_ENCONTRADA');
  }
  if (original.vendedor_id !== usuarioId) {
    throw ApiError.forbidden('Sólo el vendedor puede contraofertar', 'NO_SOS_EL_VENDEDOR');
  }
  if (original.origen !== 'COMPRADOR') {
    throw ApiError.conflict(
      'Esa propuesta ya es una contraoferta tuya',
      'YA_ES_CONTRAOFERTA'
    );
  }
  if (original.estado === 'VENCIDA') {
    throw ApiError.conflict('Esa oferta ya venció', 'OFERTA_VENCIDA');
  }
  if (original.estado !== 'PENDIENTE') {
    throw ApiError.conflict('Esa oferta ya fue respondida', 'OFERTA_YA_RESPONDIDA');
  }
  if (original.publicacion_estado !== 'ACTIVA') {
    throw ApiError.badRequest('La publicación no está activa', 'PUBLICACION_NO_ACTIVA');
  }

  const valor = validarMonto(monto, original.publicacion_precio);
  if (valor === Number(original.monto)) {
    throw ApiError.badRequest(
      'La contraoferta tiene que proponer un monto distinto',
      'CONTRAOFERTA_MISMO_MONTO'
    );
  }
  const texto = validarMensaje(mensaje);

  const conexion = await pool.getConnection();
  let nuevaId;
  try {
    await conexion.beginTransaction();

    await conexion.query(
      `UPDATE ofertas SET estado = 'RECHAZADA', respondida_en = NOW() WHERE id = ?`,
      [original.id]
    );
    const [res] = await conexion.query(
      `INSERT INTO ofertas
         (publicacion_id, usuario_id, monto, mensaje, origen, contraoferta_de_id, expira_en)
       VALUES (?, ?, ?, ?, 'VENDEDOR', ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [
        original.publicacion_id,
        original.usuario_id, // sigue siendo la negociación con ese comprador
        valor,
        texto,
        original.id,
        config.oferta.horasDeVigencia,
      ]
    );
    nuevaId = res.insertId;

    await conexion.commit();
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }

  return { oferta: toOfertaDto(await leerOferta(nuevaId)) };
}

/**
 * GET /api/ofertas/mias?tipo=ENVIADAS|RECIBIDAS
 *
 * Punto 7: la sección "Mis ofertas", donde la persona ve en un mismo lugar
 * las que envió y las que recibió. Sin `tipo` vienen las dos listas.
 *
 * "Enviadas" son las que propuso esta persona: sus ofertas como compradora,
 * más las contraofertas que hizo como vendedora. "Recibidas" es el espejo.
 */
const TIPOS_MIS_OFERTAS = ['ENVIADAS', 'RECIBIDAS'];

async function misOfertas(usuarioId, query = {}) {
  await vencerOfertasExpiradas();

  const tipo = query.tipo ? String(query.tipo).toUpperCase() : null;
  if (tipo !== null && !TIPOS_MIS_OFERTAS.includes(tipo)) {
    throw ApiError.badRequest(
      `El tipo debe ser uno de: ${TIPOS_MIS_OFERTAS.join(', ')}`,
      'TIPO_INVALIDO'
    );
  }

  // Una sola consulta con el rol resuelto en SQL. `propuso_esta_persona` dice
  // si el monto lo puso el usuario que consulta; de ahí sale tanto la
  // separación enviadas/recibidas como a quién le toca responder.
  const [filas] = await pool.query(
    `SELECT o.*,
            u.nombre AS autor_nombre,
            p.id     AS publicacion_id,
            p.titulo AS publicacion_titulo,
            p.precio AS publicacion_precio,
            p.estado AS publicacion_estado,
            (SELECT f.url FROM fotos_publicacion f
              WHERE f.publicacion_id = p.id ORDER BY f.orden, f.id LIMIT 1) AS foto_principal,
            CASE WHEN o.origen = 'COMPRADOR' THEN o.usuario_id ELSE p.vendedor_id END AS propuso_id,
            CASE WHEN o.origen = 'COMPRADOR' THEN p.vendedor_id ELSE o.usuario_id END AS responde_id,
            CASE WHEN o.origen = 'COMPRADOR' THEN p.vendedor_id ELSE o.usuario_id END AS contraparte_bruta
       FROM ofertas o
       JOIN publicaciones p ON p.id = o.publicacion_id
       JOIN usuarios u      ON u.id = o.usuario_id
      WHERE o.usuario_id = ? OR p.vendedor_id = ?
      ORDER BY o.creado_en DESC`,
    [usuarioId, usuarioId]
  );

  // Los nombres de las contrapartes, en una sola consulta extra.
  const idsContraparte = [
    ...new Set(
      filas.flatMap((f) => [f.propuso_id, f.responde_id]).filter((id) => id !== usuarioId)
    ),
  ];
  const nombres = new Map();
  if (idsContraparte.length > 0) {
    const [personas] = await pool.query(
      `SELECT id, nombre FROM usuarios WHERE id IN (${idsContraparte.map(() => '?').join(', ')})`,
      idsContraparte
    );
    for (const p of personas) nombres.set(p.id, p.nombre);
  }

  const enviadas = [];
  const recibidas = [];

  for (const fila of filas) {
    const laPropuseYo = fila.propuso_id === usuarioId;
    const contraparteId = laPropuseYo ? fila.responde_id : fila.propuso_id;

    const item = toOfertaConPublicacionDto({
      ...fila,
      contraparte_id: contraparteId,
      contraparte_nombre: nombres.get(contraparteId) ?? null,
      espera_mi_respuesta: fila.estado === 'PENDIENTE' && fila.responde_id === usuarioId,
    });

    (laPropuseYo ? enviadas : recibidas).push(item);
  }

  if (tipo === 'ENVIADAS') return { enviadas };
  if (tipo === 'RECIBIDAS') return { recibidas };
  return { enviadas, recibidas };
}

module.exports = {
  listarPreguntas,
  preguntar,
  responder,
  listarOfertas,
  ofertar,
  responderOferta,
  contraofertar,
  misOfertas,
  buscarPublicacion,
  vencerOfertasExpiradas,
};

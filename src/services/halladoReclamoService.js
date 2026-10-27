// CAPA DE SERVICIO: punto 7 de Hallado, reclamos y verificación.
//
// Las reglas del enunciado, todas acá:
//
//   - "Es mío" responde la pregunta de verificación y puede agregar una
//     descripción y una foto. La respuesta la compara el backend, nunca la
//     app: la respuesta correcta no sale del servidor.
//   - "Lo encontré" adjunta una foto y el barrio donde lo encontró.
//   - Cada persona tiene un máximo de 3 intentos por publicación. Una
//     respuesta incorrecta gasta un intento: queda guardada como reclamo
//     rechazado automáticamente, así el tope se cuenta en la base y no en
//     la memoria de la app.
//   - Un reclamo vence a las 48 horas si no recibe respuesta. El vencimiento
//     es perezoso, igual que el de las publicaciones: se marca al leer,
//     sin tareas programadas.
const { pool } = require('../config/db');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { toReclamoDto } = require('../dtos/halladoDto');
const {
  SELECT_PUBLICACION,
  normalizarRespuesta,
  validarFotos,
} = require('./halladoPublicarService');

const MAX_INTENTOS = 3;
const DESCRIPCION_MAX = 1000;
const RESPUESTA_MAX = 255;

// Sobre qué publicaciones se puede reclamar: las que todavía están en juego.
const ESTADOS_RECLAMABLES = ['ABIERTA', 'EN_RECLAMO'];

// Qué tipo de reclamo cabe en cada tipo de publicación.
const TIPO_DE_RECLAMO = { ENCONTRE: 'ES_MIO', PERDI: 'LO_ENCONTRE' };

// ---------------------------------------------------------------
// La consulta base
// ---------------------------------------------------------------
// Trae el reclamo con lo que hace falta para mostrarlo en cualquier lado:
// la publicación resumida (con su portada), las dos personas y el barrio.
const SELECT_RECLAMO = `
  SELECT r.*,
         GREATEST(0, TIMESTAMPDIFF(MINUTE, NOW(), r.vence_en)) AS minutos_para_vencer,
         TIMESTAMPDIFF(DAY, r.respondido_en, NOW()) AS dias_desde_respuesta,
         p.tipo       AS pub_tipo,
         p.titulo     AS pub_titulo,
         p.usuario_id AS publicador_id,
         IF(p.estado = 'ABIERTA' AND p.vence_en < NOW(), 'VENCIDA', p.estado) AS pub_estado,
         (SELECT f.url FROM hallado_fotos f
           WHERE f.publicacion_id = p.id ORDER BY f.orden, f.id LIMIT 1) AS pub_portada,
         ur.nombre AS reclamante_nombre,
         up.nombre AS publicador_nombre,
         z.nombre  AS barrio_nombre
    FROM hallado_reclamos r
    JOIN hallado_publicaciones p ON p.id = r.publicacion_id
    JOIN usuarios ur ON ur.id = r.reclamante_id
    JOIN usuarios up ON up.id = p.usuario_id
    LEFT JOIN zonas z ON z.id = r.barrio_id
`;

// ---------------------------------------------------------------
// Vencimiento perezoso
// ---------------------------------------------------------------
// Se llama antes de leer o tocar reclamos. Marca VENCIDO lo pendiente que
// pasó su fecha y, si una publicación quedó EN_RECLAMO sin ningún reclamo
// pendiente, la devuelve a ABIERTA: el objeto sigue sin dueño.
async function vencerReclamos() {
  await pool.query(
    `UPDATE hallado_reclamos SET estado = 'VENCIDO'
      WHERE estado = 'PENDIENTE' AND vence_en <= NOW()`
  );
  await pool.query(
    `UPDATE hallado_publicaciones p SET p.estado = 'ABIERTA'
      WHERE p.estado = 'EN_RECLAMO'
        AND NOT EXISTS (
          SELECT 1 FROM hallado_reclamos r
           WHERE r.publicacion_id = p.id AND r.estado = 'PENDIENTE'
        )`
  );
}

// ---------------------------------------------------------------
// Validaciones
// ---------------------------------------------------------------

function validarId(valor, nombre = 'id') {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest(`El ${nombre} no es válido`, 'ID_INVALIDO');
  }
  return id;
}

function validarTexto(valor, { campo, codigo, max, obligatorio }) {
  const limpio = String(valor ?? '').trim();
  if (limpio === '') {
    if (obligatorio) throw ApiError.badRequest(`${campo} es obligatorio`, `${codigo}_REQUERIDO`);
    return null;
  }
  if (limpio.length > max) {
    throw ApiError.badRequest(`${campo} no puede tener más de ${max} caracteres`, `${codigo}_LARGO`);
  }
  return limpio;
}

// Misma regla que las fotos de una publicación: /uploads/ de este backend o
// una URL http(s). Reusamos la validación para no tener dos criterios.
function validarFotoUrl(valor, { obligatoria }) {
  const limpia = String(valor ?? '').trim();
  if (limpia === '') {
    if (obligatoria) throw ApiError.badRequest('La foto es obligatoria', 'FOTO_REQUERIDA');
    return null;
  }
  return validarFotos([limpia])[0];
}

async function validarBarrio(barrioId) {
  if (barrioId === undefined || barrioId === null || barrioId === '') {
    throw ApiError.badRequest('Indicá el barrio donde lo encontraste', 'BARRIO_REQUERIDO');
  }
  const [filas] = await pool.query('SELECT id FROM zonas WHERE id = ?', [barrioId]);
  if (filas.length === 0) {
    throw ApiError.badRequest('Ese barrio no existe', 'BARRIO_INVALIDO');
  }
  return filas[0].id;
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

async function buscarPublicacion(id) {
  const [filas] = await pool.query(`${SELECT_PUBLICACION} WHERE p.id = ? LIMIT 1`, [id]);
  if (filas.length === 0) {
    throw ApiError.notFound('Esa publicación no existe', 'PUBLICACION_NO_ENCONTRADA');
  }
  return filas[0];
}

async function buscarReclamo(id) {
  const [filas] = await pool.query(`${SELECT_RECLAMO} WHERE r.id = ? LIMIT 1`, [id]);
  if (filas.length === 0) {
    throw ApiError.notFound('Ese reclamo no existe', 'RECLAMO_NO_ENCONTRADO');
  }
  return filas[0];
}

// Los reclamos que una persona hizo sobre una publicación, del más nuevo al
// más viejo. Son sus intentos: todos cuentan, también los rechazados.
async function intentosDe(publicacionId, usuarioId) {
  const [filas] = await pool.query(
    `${SELECT_RECLAMO} WHERE r.publicacion_id = ? AND r.reclamante_id = ? ORDER BY r.creado_en DESC, r.id DESC`,
    [publicacionId, usuarioId]
  );
  return filas;
}

// Lo que el detalle (punto 4) necesita saber sobre los reclamos para quien
// está mirando: su último reclamo, cuántos intentos le quedan y, si es el
// publicador, cuántos reclamos esperan su respuesta.
async function resumenParaDetalle(publicacionId, usuarioId) {
  const [pendientes] = await pool.query(
    "SELECT COUNT(*) AS n FROM hallado_reclamos WHERE publicacion_id = ? AND estado = 'PENDIENTE'",
    [publicacionId]
  );
  const mios = usuarioId === null ? [] : await intentosDe(publicacionId, usuarioId);

  return {
    miReclamo: mios[0] ?? null,
    intentosRestantes: Math.max(0, MAX_INTENTOS - mios.length),
    pendientes: Number(pendientes[0].n),
  };
}

function textoDeIntentos(restantes) {
  if (restantes <= 0) return 'ya no te quedan intentos para esta publicación';
  if (restantes === 1) return 'te queda 1 intento';
  return `te quedan ${restantes} intentos`;
}

// ---------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------

// POST /api/hallado/publicaciones/:id/reclamos
//
// El body depende del tipo de la publicación:
//   ENCONTRE (Es mío):      { respuesta, descripcion?, fotoUrl? }
//   PERDI    (Lo encontré): { fotoUrl, barrioId, descripcion? }
async function crear(publicacionId, usuarioId, datos = {}) {
  await vencerReclamos();

  const id = validarId(publicacionId, 'id de la publicación');
  const publicacion = await buscarPublicacion(id);

  if (publicacion.usuario_id === usuarioId) {
    throw ApiError.badRequest('No podés reclamar tu propia publicación', 'ES_TU_PUBLICACION');
  }

  const estado = publicacion.estado_efectivo ?? publicacion.estado;
  if (!ESTADOS_RECLAMABLES.includes(estado)) {
    throw ApiError.conflict(
      estado === 'RESUELTA'
        ? 'Esa publicación ya está resuelta'
        : 'Esa publicación está vencida',
      'PUBLICACION_NO_RECLAMABLE'
    );
  }

  const intentos = await intentosDe(id, usuarioId);
  if (intentos.some((r) => r.estado === 'PENDIENTE')) {
    throw ApiError.conflict(
      'Ya tenés un reclamo esperando respuesta en esta publicación',
      'RECLAMO_PENDIENTE'
    );
  }
  if (intentos.length >= MAX_INTENTOS) {
    throw ApiError.conflict(
      `Ya usaste los ${MAX_INTENTOS} intentos para esta publicación`,
      'SIN_INTENTOS'
    );
  }

  const tipo = TIPO_DE_RECLAMO[publicacion.tipo];
  const descripcion = validarTexto(datos.descripcion, {
    campo: 'La descripción', codigo: 'DESCRIPCION', max: DESCRIPCION_MAX, obligatorio: false,
  });

  if (tipo === 'ES_MIO') {
    const respuesta = normalizarRespuesta(
      validarTexto(datos.respuesta, {
        campo: 'La respuesta a la pregunta de verificación',
        codigo: 'RESPUESTA',
        max: RESPUESTA_MAX,
        obligatorio: true,
      })
    );
    const fotoUrl = validarFotoUrl(datos.fotoUrl, { obligatoria: false });
    const correcta = respuesta === publicacion.respuesta_verificacion;

    if (!correcta) {
      // Queda registrado como rechazado automático: es lo que gasta el
      // intento. Sin esta fila, alguien podría probar respuestas sin tope.
      await pool.query(
        `INSERT INTO hallado_reclamos
           (publicacion_id, reclamante_id, tipo, respuesta, respuesta_correcta,
            descripcion, foto_url, estado, motivo, automatico, vence_en, respondido_en)
         VALUES (?, ?, 'ES_MIO', ?, 0, ?, ?, 'RECHAZADO',
                 'La respuesta a la pregunta de verificación no coincide', 1, NOW(), NOW())`,
        [id, usuarioId, respuesta, descripcion, fotoUrl]
      );
      const restantes = MAX_INTENTOS - intentos.length - 1;
      throw ApiError.badRequest(
        `La respuesta no coincide: ${textoDeIntentos(restantes)}.`,
        'RESPUESTA_INCORRECTA'
      );
    }

    return insertarPendiente(publicacion, usuarioId, {
      tipo, respuesta, respuestaCorrecta: 1, descripcion, fotoUrl, barrioId: null,
    });
  }

  // LO_ENCONTRE: la foto y el barrio son obligatorios, es lo que le permite
  // al dueño confirmar si se trata de lo suyo.
  const fotoUrl = validarFotoUrl(datos.fotoUrl, { obligatoria: true });
  const barrioId = await validarBarrio(datos.barrioId);

  return insertarPendiente(publicacion, usuarioId, {
    tipo, respuesta: null, respuestaCorrecta: null, descripcion, fotoUrl, barrioId,
  });
}

// Da de alta el reclamo pendiente y pone la publicación EN_RECLAMO. Las dos
// cosas van juntas o ninguna: una publicación ABIERTA con un reclamo
// pendiente adentro sería un estado que nadie espera.
async function insertarPendiente(publicacion, usuarioId, campos) {
  const conexion = await pool.getConnection();
  let reclamoId;
  try {
    await conexion.beginTransaction();

    const [resultado] = await conexion.query(
      `INSERT INTO hallado_reclamos
         (publicacion_id, reclamante_id, tipo, respuesta, respuesta_correcta,
          descripcion, foto_url, barrio_id, estado, vence_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [
        publicacion.id, usuarioId, campos.tipo, campos.respuesta, campos.respuestaCorrecta,
        campos.descripcion, campos.fotoUrl, campos.barrioId,
        config.reclamo.horasDeVigencia,
      ]
    );
    reclamoId = resultado.insertId;

    await conexion.query(
      "UPDATE hallado_publicaciones SET estado = 'EN_RECLAMO' WHERE id = ? AND estado = 'ABIERTA'",
      [publicacion.id]
    );

    await conexion.commit();
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }

  return { reclamo: toReclamoDto(await buscarReclamo(reclamoId), usuarioId) };
}

// ---------------------------------------------------------------
// Responder: aceptar o rechazar
// ---------------------------------------------------------------
// "El publicador puede aceptar o rechazar cada reclamo."
//
// Aceptar cierra el caso: la publicación pasa a RESUELTA (el objeto ya tiene
// a quién volver), se anota cuándo, y los demás reclamos pendientes de esa
// publicación se rechazan solos porque el objeto es uno. A partir de acá
// quien reclamó ve la dirección exacta (punto 4) y el caso entra al
// historial (punto 10).
//
// Rechazar devuelve la publicación a ABIERTA si no quedó ningún otro
// reclamo esperando: el objeto sigue sin dueño.

const MOTIVO_MAX = 300;

async function responder(reclamoId, usuarioId, decision, motivo = null) {
  await vencerReclamos();

  const id = validarId(reclamoId, 'id del reclamo');
  const reclamo = await buscarReclamo(id);

  if (reclamo.publicador_id !== usuarioId) {
    throw ApiError.forbidden('Sólo el publicador puede responder este reclamo', 'NO_SOS_EL_PUBLICADOR');
  }
  if (reclamo.estado === 'VENCIDO') {
    throw ApiError.conflict('Ese reclamo ya venció', 'RECLAMO_VENCIDO');
  }
  if (reclamo.estado !== 'PENDIENTE') {
    throw ApiError.conflict('Ese reclamo ya fue respondido', 'RECLAMO_YA_RESPONDIDO');
  }

  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    if (decision === 'ACEPTADO') {
      await conexion.query(
        "UPDATE hallado_reclamos SET estado = 'ACEPTADO', respondido_en = NOW() WHERE id = ?",
        [id]
      );
      await conexion.query(
        `UPDATE hallado_reclamos
            SET estado = 'RECHAZADO', motivo = 'Se aceptó otro reclamo', automatico = 1, respondido_en = NOW()
          WHERE publicacion_id = ? AND estado = 'PENDIENTE' AND id <> ?`,
        [reclamo.publicacion_id, id]
      );
      await conexion.query(
        "UPDATE hallado_publicaciones SET estado = 'RESUELTA', resuelto_en = NOW() WHERE id = ?",
        [reclamo.publicacion_id]
      );
    } else {
      await conexion.query(
        "UPDATE hallado_reclamos SET estado = 'RECHAZADO', motivo = ?, respondido_en = NOW() WHERE id = ?",
        [motivo, id]
      );
      await conexion.query(
        `UPDATE hallado_publicaciones p SET p.estado = 'ABIERTA'
          WHERE p.id = ? AND p.estado = 'EN_RECLAMO'
            AND NOT EXISTS (
              SELECT 1 FROM hallado_reclamos r
               WHERE r.publicacion_id = p.id AND r.estado = 'PENDIENTE'
            )`,
        [reclamo.publicacion_id]
      );
    }

    await conexion.commit();
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }

  return { reclamo: toReclamoDto(await buscarReclamo(id), usuarioId) };
}

// POST /api/hallado/reclamos/:id/aceptar
async function aceptar(reclamoId, usuarioId) {
  return responder(reclamoId, usuarioId, 'ACEPTADO');
}

// POST /api/hallado/reclamos/:id/rechazar   { motivo? }
async function rechazar(reclamoId, usuarioId, datos = {}) {
  const motivo = validarTexto(datos.motivo, {
    campo: 'El motivo', codigo: 'MOTIVO', max: MOTIVO_MAX, obligatorio: false,
  });
  return responder(reclamoId, usuarioId, 'RECHAZADO', motivo);
}

// ---------------------------------------------------------------
// Mis reclamos
// ---------------------------------------------------------------
// "Sección 'Mis reclamos' donde la persona ve, en un mismo lugar y siempre
// actualizados, los reclamos que envió y los que recibió."
//
// Siempre actualizados = el vencimiento perezoso corre antes de listar, así
// que un pendiente que pasó las 48 horas ya aparece VENCIDO.

// Los pendientes primero (son los que piden algo), después del más nuevo
// al más viejo.
const ORDEN_RECLAMOS = "(r.estado = 'PENDIENTE') DESC, r.creado_en DESC, r.id DESC";

// GET /api/hallado/reclamos/mios
async function listarMios(usuarioId) {
  await vencerReclamos();

  const [enviados] = await pool.query(
    `${SELECT_RECLAMO} WHERE r.reclamante_id = ? ORDER BY ${ORDEN_RECLAMOS}`,
    [usuarioId]
  );

  // Recibidos: los que llegaron sobre mis publicaciones. Los que el sistema
  // rechazó solo por respuesta incorrecta no se listan: nunca llegaron a la
  // persona, no tuvo que decidir nada, y verlos sólo haría ruido.
  const [recibidos] = await pool.query(
    `${SELECT_RECLAMO}
      WHERE p.usuario_id = ?
        AND NOT (r.automatico = 1 AND r.respuesta_correcta = 0)
      ORDER BY ${ORDEN_RECLAMOS}`,
    [usuarioId]
  );

  const pendientes = (filas) => filas.filter((r) => r.estado === 'PENDIENTE').length;

  return {
    enviados: enviados.map((fila) => toReclamoDto(fila, usuarioId)),
    recibidos: recibidos.map((fila) => toReclamoDto(fila, usuarioId)),
    // Para las solapas y el indicador del menú: cuántos esperan de cada lado.
    resumen: {
      enviadosPendientes: pendientes(enviados),
      recibidosPendientes: pendientes(recibidos),
    },
  };
}

// GET /api/hallado/reclamos/:id
// Lo ven las dos partes y nadie más: un reclamo lleva la foto y la respuesta
// de quien reclama.
async function obtener(reclamoId, usuarioId) {
  await vencerReclamos();

  const id = validarId(reclamoId, 'id del reclamo');
  const reclamo = await buscarReclamo(id);

  if (reclamo.reclamante_id !== usuarioId && reclamo.publicador_id !== usuarioId) {
    throw ApiError.forbidden('Ese reclamo no es tuyo', 'NO_TE_CORRESPONDE');
  }

  return { reclamo: toReclamoDto(reclamo, usuarioId) };
}

module.exports = {
  crear,
  aceptar,
  rechazar,
  listarMios,
  obtener,
  vencerReclamos,
  resumenParaDetalle,
  MAX_INTENTOS,
  // Para que los puntos 4 y 10 lean reclamos con la misma consulta y el
  // mismo DTO.
  SELECT_RECLAMO,
  buscarReclamo,
};

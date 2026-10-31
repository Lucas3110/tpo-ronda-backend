const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

function validarId(valor) {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0) throw ApiError.badRequest('El reclamo no es válido', 'ID_INVALIDO');
  return id;
}

function validarPropuesta(datos) {
  if (typeof datos.direccion !== 'string' || !datos.direccion.trim() || datos.direccion.trim().length > 255) {
    throw ApiError.badRequest('Escribí una dirección de hasta 255 caracteres, con localidad', 'DIRECCION_INVALIDA');
  }
  const { lat = null, lng = null } = datos;
  if ((lat !== null || lng !== null) &&
      (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) ||
       Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
    throw ApiError.badRequest('Las coordenadas no son válidas', 'COORDENADAS_INVALIDAS');
  }
  return { direccion: datos.direccion.trim(), lat, lng };
}

async function leer(conexion, id, usuarioId, bloquear = false) {
  // Todos los escritores bloquean primero la publicación y después el reclamo.
  const [filas] = await conexion.query(
    `SELECT r.id, r.publicacion_id, r.reclamante_id, r.estado, r.tipo,
            p.usuario_id AS publicador_id, p.titulo, p.estado AS pub_estado, p.resuelto_en
       FROM hallado_reclamos r JOIN hallado_publicaciones p ON p.id = r.publicacion_id
      WHERE r.id = ?`, [id]);
  let reclamo = filas[0];
  if (!reclamo) throw ApiError.notFound('Ese reclamo no existe', 'RECLAMO_NO_ENCONTRADO');
  if (![reclamo.reclamante_id, reclamo.publicador_id].includes(usuarioId)) {
    throw ApiError.forbidden('Sólo las dos partes pueden ver este encuentro', 'NO_TE_CORRESPONDE');
  }
  if (bloquear) {
    const [[publicacion]] = await conexion.query('SELECT estado, resuelto_en FROM hallado_publicaciones WHERE id = ? FOR UPDATE', [reclamo.publicacion_id]);
    const [[actual]] = await conexion.query('SELECT estado FROM hallado_reclamos WHERE id = ? FOR UPDATE', [id]);
    reclamo = { ...reclamo, estado: actual.estado, pub_estado: publicacion.estado, resuelto_en: publicacion.resuelto_en };
  }
  if (reclamo.estado !== 'ACEPTADO') throw ApiError.conflict('Primero debe aceptarse el reclamo', 'RECLAMO_NO_ACEPTADO');
  // FOR UPDATE lee la última versión confirmada, incluso con REPEATABLE READ.
  const [[encuentro]] = await conexion.query(`SELECT * FROM hallado_encuentros WHERE reclamo_id = ?${bloquear ? ' FOR UPDATE' : ''}`, [id]);
  return { reclamo, encuentro: encuentro ?? null };
}

function dto({ reclamo, encuentro }, usuarioId) {
  const tieneObjeto = (reclamo.tipo === 'ES_MIO' ? reclamo.publicador_id : reclamo.reclamante_id) === usuarioId;
  const resuelto = reclamo.pub_estado === 'RESUELTA';
  const esperaMiRespuesta = encuentro?.estado === 'PROPUESTO' && encuentro.propuesto_por !== usuarioId;
  return {
    reclamoId: reclamo.id,
    publicacion: { id: reclamo.publicacion_id, titulo: reclamo.titulo },
    resuelto,
    encuentro: encuentro ? {
      direccion: encuentro.direccion,
      lat: encuentro.lat === null ? null : Number(encuentro.lat),
      lng: encuentro.lng === null ? null : Number(encuentro.lng),
      estado: encuentro.estado, version: encuentro.version,
      propuestoPorMi: encuentro.propuesto_por === usuarioId,
      concretadoEn: encuentro.concretado_en,
    } : null,
    puedoProponer: !resuelto && (!encuentro ? tieneObjeto : Boolean(esperaMiRespuesta)),
    puedoAceptar: !resuelto && Boolean(esperaMiRespuesta),
    puedoConcretar: !resuelto && encuentro?.estado === 'ACEPTADO',
  };
}

async function obtener(id, usuarioId) {
  return dto(await leer(pool, validarId(id), usuarioId), usuarioId);
}

async function cambiar(id, usuarioId, accion, datos = {}) {
  id = validarId(id);
  const propuesta = accion === 'proponer' ? validarPropuesta(datos) : null;
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const actual = await leer(conexion, id, usuarioId, true);
    const vista = dto(actual, usuarioId);
    if (vista.resuelto) throw ApiError.conflict('La devolución ya está registrada', 'YA_CONCRETADO');
    if (!Number.isInteger(datos.version) || datos.version !== (actual.encuentro?.version ?? 0)) {
      throw ApiError.conflict('El encuentro cambió. Actualizá la pantalla antes de continuar.', 'ENCUENTRO_CAMBIO');
    }
    if (accion === 'proponer') {
      if (!vista.puedoProponer) throw ApiError.conflict('Ahora le corresponde responder a la otra persona', 'NO_PODES_PROPONER');
      await conexion.query(
        `INSERT INTO hallado_encuentros (reclamo_id, propuesto_por, direccion, lat, lng)
         VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE
         propuesto_por = VALUES(propuesto_por), direccion = VALUES(direccion), lat = VALUES(lat), lng = VALUES(lng),
         version = version + 1, estado = 'PROPUESTO', actualizado_en = NOW(), aceptado_en = NULL`,
        [id, usuarioId, propuesta.direccion, propuesta.lat, propuesta.lng]);
    } else if (accion === 'aceptar') {
      if (!vista.puedoAceptar) throw ApiError.conflict('Sólo la otra parte puede aceptar una propuesta pendiente', 'NO_PODES_ACEPTAR');
      await conexion.query("UPDATE hallado_encuentros SET estado = 'ACEPTADO', aceptado_en = NOW(), version = version + 1 WHERE reclamo_id = ?", [id]);
    } else if (accion === 'concretar') {
      if (!vista.puedoConcretar) throw ApiError.conflict('Primero deben acordar el punto de encuentro', 'ENCUENTRO_NO_ACORDADO');
      await conexion.query("UPDATE hallado_encuentros SET estado = 'CONCRETADO', concretado_en = NOW(), version = version + 1 WHERE reclamo_id = ?", [id]);
      await conexion.query("UPDATE hallado_publicaciones SET estado = 'RESUELTA', resuelto_en = NOW() WHERE id = ?", [actual.reclamo.publicacion_id]);
    } else {
      throw ApiError.badRequest('Acción desconocida');
    }
    const resultado = dto(await leer(conexion, id, usuarioId, true), usuarioId);
    await conexion.commit();
    return resultado;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

module.exports = { obtener, cambiar, validarPropuesta };

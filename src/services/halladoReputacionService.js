// CAPA DE SERVICIO: la reputación de una persona en Hallado.
//
// El enunciado la define en el punto 2: "la reputación se construye a partir
// de las devoluciones concretadas y de las valoraciones recibidas". Vive en
// un service propio porque la piden tres puntos distintos: el 4 la muestra al
// lado del publicador, el 2 en el perfil público y el 10 la alimenta con las
// valoraciones. Si cada uno la calculara por su cuenta, tarde o temprano
// darían números distintos para la misma persona.
//
// Qué cuenta como "devolución concretada"
// ---------------------------------------
// Un caso cerrado es un reclamo ACEPTADO (punto 7), y cada caso tiene dos
// lados: alguien devolvió y alguien recuperó.
//
//   - Publicó algo ENCONTRADO y aceptó un "Es mío":      devolvió.
//   - Reclamó "Es mío" y se lo aceptaron:                 recuperó.
//   - Publicó algo PERDIDO y aceptó un "Lo encontré":     recuperó.
//   - Reclamó "Lo encontré" y se lo aceptaron:            devolvió.
//
// Se cuenta sobre los reclamos aceptados y no sobre las publicaciones
// resueltas para no depender de que las dos cosas estén siempre en sincro.
//
// Y las valoraciones (punto 10): cuántas positivas y negativas recibió, y
// cuántos agradecimientos públicos le dejaron.
const { pool } = require('../config/db');

async function obtenerReputacion(usuarioId) {
  const [filas] = await pool.query(
    `SELECT
        (SELECT COUNT(*) FROM hallado_valoraciones
          WHERE destinatario_id = ? AND tipo = 'POSITIVA') AS valoraciones_positivas,
        (SELECT COUNT(*) FROM hallado_valoraciones
          WHERE destinatario_id = ? AND tipo = 'NEGATIVA') AS valoraciones_negativas,
        (SELECT COUNT(*) FROM hallado_valoraciones
          WHERE destinatario_id = ? AND agradecimiento IS NOT NULL) AS agradecimientos,
        (SELECT COUNT(*) FROM hallado_reclamos r JOIN hallado_publicaciones p ON p.id = r.publicacion_id
          WHERE r.estado = 'ACEPTADO'
            AND ((p.usuario_id = ? AND r.tipo = 'ES_MIO') OR (r.reclamante_id = ? AND r.tipo = 'LO_ENCONTRE'))) AS devoluciones,
        (SELECT COUNT(*) FROM hallado_reclamos r JOIN hallado_publicaciones p ON p.id = r.publicacion_id
          WHERE r.estado = 'ACEPTADO'
            AND ((p.usuario_id = ? AND r.tipo = 'LO_ENCONTRE') OR (r.reclamante_id = ? AND r.tipo = 'ES_MIO'))) AS recuperos`,
    [usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId]
  );
  return filas[0];
}

module.exports = { obtenerReputacion };

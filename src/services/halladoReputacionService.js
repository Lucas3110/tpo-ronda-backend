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
// Una publicación RESUELTA es un caso cerrado: el objeto llegó a su dueño.
// Si la publicó alguien que ENCONTRÓ algo, esa persona lo devolvió. Si la
// publicó alguien que PERDIÓ algo, esa persona lo recuperó (y lo devolvió
// quien reclamó "Lo encontré", que se suma cuando entre el punto 7).
const { pool } = require('../config/db');

async function obtenerReputacion(usuarioId) {
  const [filas] = await pool.query(
    `SELECT
        (SELECT COUNT(*) FROM hallado_publicaciones
          WHERE usuario_id = ? AND tipo = 'ENCONTRE' AND estado = 'RESUELTA') AS devoluciones,
        (SELECT COUNT(*) FROM hallado_publicaciones
          WHERE usuario_id = ? AND tipo = 'PERDI' AND estado = 'RESUELTA') AS recuperos`,
    [usuarioId, usuarioId]
  );
  return filas[0];
}

module.exports = { obtenerReputacion };

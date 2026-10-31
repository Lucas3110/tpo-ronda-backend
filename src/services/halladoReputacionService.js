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
// Un caso cerrado es una devolución confirmada (punto 8), y cada caso tiene dos
// lados: alguien devolvió y alguien recuperó.
//
//   - Publicó algo ENCONTRADO y aceptó un "Es mío":      devolvió.
//   - Reclamó "Es mío" y se lo aceptaron:                 recuperó.
//   - Publicó algo PERDIDO y aceptó un "Lo encontré":     recuperó.
//   - Reclamó "Lo encontré" y se lo aceptaron:            devolvió.
//
// Se cuentan solamente los reclamos aceptados con entrega registrada.
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
          WHERE r.estado = 'ACEPTADO' AND p.estado = 'RESUELTA' AND p.resuelto_en IS NOT NULL
            AND ((p.usuario_id = ? AND r.tipo = 'ES_MIO') OR (r.reclamante_id = ? AND r.tipo = 'LO_ENCONTRE'))) AS devoluciones,
        (SELECT COUNT(*) FROM hallado_reclamos r JOIN hallado_publicaciones p ON p.id = r.publicacion_id
          WHERE r.estado = 'ACEPTADO' AND p.estado = 'RESUELTA' AND p.resuelto_en IS NOT NULL
            AND ((p.usuario_id = ? AND r.tipo = 'LO_ENCONTRE') OR (r.reclamante_id = ? AND r.tipo = 'ES_MIO'))) AS recuperos`,
    [usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId]
  );
  return filas[0];
}

// ---------------------------------------------------------------
// Insignias
// ---------------------------------------------------------------
// "Al alcanzar ciertas metas (por ejemplo, 5 devoluciones concretadas) el
// perfil muestra una insignia visible, como 'Vecino solidario'."
//
// Se calculan, no se guardan: salen de la reputación, y guardarlas sería
// tener dos fuentes de verdad que se pueden desincronizar. El costo es nulo,
// porque la reputación ya se consulta para mostrar el perfil.
//
// Cada una dice qué contador mira y cuál es la meta. Así la app puede
// mostrar también el progreso hacia las que faltan ("3 de 5").
const INSIGNIAS = [
  {
    codigo: 'PRIMERA_DEVOLUCION',
    nombre: 'Primera devolución',
    descripcion: 'Devolvió su primer objeto a su dueño.',
    contador: 'devoluciones',
    meta: 1,
  },
  {
    codigo: 'VECINO_SOLIDARIO',
    nombre: 'Vecino solidario',
    descripcion: 'Concretó 5 devoluciones.',
    contador: 'devoluciones',
    meta: 5,
  },
  {
    codigo: 'MUY_RECOMENDADO',
    nombre: 'Muy recomendado',
    descripcion: 'Recibió 10 valoraciones positivas.',
    contador: 'valoraciones_positivas',
    meta: 10,
  },
  {
    codigo: 'AGRADECIDO',
    nombre: 'Agradecido por la comunidad',
    descripcion: 'Recibió 3 agradecimientos públicos.',
    contador: 'agradecimientos',
    meta: 3,
  },
];

function calcularInsignias(reputacion) {
  return INSIGNIAS.map(({ contador, meta, ...insignia }) => {
    const actual = Number(reputacion?.[contador] ?? 0);
    return {
      ...insignia,
      obtenida: actual >= meta,
      progreso: { actual: Math.min(actual, meta), meta },
    };
  });
}

module.exports = { obtenerReputacion, calcularInsignias };

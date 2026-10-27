// CAPA DE SERVICIO: punto 10 de Hallado, el historial de casos resueltos.
//
// "Historial de casos resueltos, separado en 'Devolví' y 'Recuperé', con
// fecha, objeto y contraparte. Filtro por rango de fechas y por tipo."
//
// Qué es un caso
// --------------
// Un reclamo ACEPTADO (punto 7). Cada caso tiene dos lados y la misma fila
// aparece en el historial de las dos personas, con el rol dado vuelta:
//
//   publiqué algo ENCONTRADO y acepté un "Es mío"   -> DEVOLVI
//   reclamé "Es mío" y me lo aceptaron              -> RECUPERE
//   publiqué algo PERDIDO y acepté un "Lo encontré" -> RECUPERE
//   reclamé "Lo encontré" y me lo aceptaron         -> DEVOLVI
//
// La fecha del caso es la de la aceptación: es el momento en que el objeto
// tiene a quién volver, y desde ahí corren los 7 días para valorar.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toCasoDto } = require('../dtos/halladoDto');
const { SELECT_RECLAMO, vencerReclamos } = require('./halladoReclamoService');

const ROLES = ['DEVOLVI', 'RECUPERE'];

// El rol se calcula en SQL para poder filtrar por él en la misma consulta.
const ROL_SQL = `
  CASE WHEN (p.usuario_id = ? AND r.tipo = 'ES_MIO') OR (r.reclamante_id = ? AND r.tipo = 'LO_ENCONTRE')
       THEN 'DEVOLVI' ELSE 'RECUPERE' END
`;

function validarRol(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const rol = String(valor).trim().toUpperCase();
  if (!ROLES.includes(rol)) {
    throw ApiError.badRequest(`El tipo debe ser uno de: ${ROLES.join(', ')}`, 'TIPO_INVALIDO');
  }
  return rol;
}

function validarFecha(valor, nombre) {
  if (valor === undefined || valor === null || valor === '') return null;
  const texto = String(valor).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw ApiError.badRequest(`${nombre} tiene que venir como AAAA-MM-DD`, 'FECHA_INVALIDA');
  }
  return texto;
}

// GET /api/hallado/historial?tipo=DEVOLVI|RECUPERE&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
async function listar(usuarioId, filtros = {}) {
  await vencerReclamos();

  const rol = validarRol(filtros.tipo);
  const desde = validarFecha(filtros.desde, 'desde');
  const hasta = validarFecha(filtros.hasta, 'hasta');
  if (desde && hasta && desde > hasta) {
    throw ApiError.badRequest('El rango empieza después de terminar', 'RANGO_INVALIDO');
  }

  // Todos los casos de la persona, de los dos lados.
  const condiciones = ["r.estado = 'ACEPTADO'", '(r.reclamante_id = ? OR p.usuario_id = ?)'];
  const parametros = [usuarioId, usuarioId, usuarioId, usuarioId];

  // DATE() y no el DATETIME pelado: "hasta hoy" tiene que incluir lo de
  // hoy a la tarde.
  if (desde) {
    condiciones.push('DATE(r.respondido_en) >= ?');
    parametros.push(desde);
  }
  if (hasta) {
    condiciones.push('DATE(r.respondido_en) <= ?');
    parametros.push(hasta);
  }

  // El rol es una columna calculada: se filtra con HAVING, que corre después
  // del SELECT. En el WHERE no existiría todavía.
  const having = rol ? 'HAVING rol = ?' : '';
  if (rol) parametros.push(rol);

  const [filas] = await pool.query(
    `${SELECT_RECLAMO.replace('SELECT r.*,', `SELECT r.*, ${ROL_SQL} AS rol,`)}
      WHERE ${condiciones.join(' AND ')}
      ${having}
      ORDER BY r.respondido_en DESC, r.id DESC`,
    parametros
  );

  // El resumen cuenta TODOS los casos, no los filtrados: es lo que necesitan
  // las solapas "Devolví (3)" y "Recuperé (1)".
  const [totales] = await pool.query(
    `SELECT ${ROL_SQL} AS rol, COUNT(*) AS cantidad
       FROM hallado_reclamos r
       JOIN hallado_publicaciones p ON p.id = r.publicacion_id
      WHERE r.estado = 'ACEPTADO' AND (r.reclamante_id = ? OR p.usuario_id = ?)
      GROUP BY rol`,
    [usuarioId, usuarioId, usuarioId, usuarioId]
  );
  const resumen = { devolvi: 0, recupere: 0 };
  for (const fila of totales) {
    if (fila.rol === 'DEVOLVI') resumen.devolvi = Number(fila.cantidad);
    if (fila.rol === 'RECUPERE') resumen.recupere = Number(fila.cantidad);
  }

  return {
    casos: filas.map((fila) => toCasoDto(fila, usuarioId)),
    resumen,
  };
}

module.exports = { listar, ROL_SQL };

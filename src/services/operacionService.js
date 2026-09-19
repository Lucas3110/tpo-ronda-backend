// Punto 9: historial de operaciones y calificaciones.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toOperacionDto, toCalificacionDto } = require('../dtos/operacionDto');

// "Dentro de los 7 días posteriores a la entrega, cada parte recibe en la app
// la opción de calificar a la otra".
const DIAS_PARA_CALIFICAR = 7;
const COMENTARIO_MAX = 500;
const TIPOS = ['COMPRA', 'VENTA'];

/**
 * SELECT del historial.
 *
 * El `?` que se repite es el id de quien consulta: con él se resuelve en SQL
 * de qué lado estuvo (tipo y contraparte) y en qué estado está la
 * calificación. Hacerlo acá y no en JavaScript evita traer filas de más y
 * recorrerlas dos veces.
 */
const SELECT_HISTORIAL = `
  SELECT o.id, o.publicacion_id, o.monto, o.concretada_en,
         p.titulo AS publicacion_titulo,
         (SELECT f.url FROM fotos_publicacion f
           WHERE f.publicacion_id = p.id ORDER BY f.orden, f.id LIMIT 1) AS foto_principal,

         CASE WHEN o.comprador_id = ? THEN 'COMPRA' ELSE 'VENTA' END AS tipo,
         CASE WHEN o.comprador_id = ? THEN o.vendedor_id ELSE o.comprador_id END AS contraparte_id,

         (SELECT u.nombre FROM usuarios u
           WHERE u.id = CASE WHEN o.comprador_id = ? THEN o.vendedor_id ELSE o.comprador_id END
         ) AS contraparte_nombre,

         (SELECT c.estrellas FROM calificaciones c
           WHERE c.operacion_id = o.id AND c.calificador_id = ?) AS mis_estrellas,
         (SELECT c.estrellas FROM calificaciones c
           WHERE c.operacion_id = o.id AND c.calificado_id = ?) AS estrellas_recibidas,

         (SELECT COUNT(*) FROM calificaciones c
           WHERE c.operacion_id = o.id AND c.calificador_id = ?) AS ya_califique,

         -- Días que quedan de la ventana de 7 días. Negativo = ya se cerró.
         DATEDIFF(DATE_ADD(o.concretada_en, INTERVAL ${DIAS_PARA_CALIFICAR} DAY), NOW())
           AS dias_restantes

    FROM operaciones o
    LEFT JOIN publicaciones p ON p.id = o.publicacion_id
`;

/** Los 6 `?` del SELECT de arriba son todos el id de quien consulta. */
const paramsDeUsuario = (usuarioId) => Array(6).fill(usuarioId);

function leerFecha(valor, nombre) {
  if (valor === undefined || valor === null || valor === '') return null;
  const texto = String(valor).trim();
  // Formato ISO corto, que es lo que manda la app desde un DatePicker.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw ApiError.badRequest(
      `${nombre} tiene que venir como AAAA-MM-DD`,
      'FECHA_INVALIDA'
    );
  }
  if (Number.isNaN(Date.parse(texto))) {
    throw ApiError.badRequest(`${nombre} no es una fecha real`, 'FECHA_INVALIDA');
  }
  return texto;
}

/**
 * Completa cada fila con si se puede calificar o no.
 *
 * Se calcula acá y no en el SQL porque cruza dos cosas ya resueltas (todavía
 * no califiqué + la ventana sigue abierta) y dejarlo en el WHERE haría la
 * consulta bastante más difícil de leer.
 */
function conEstadoDeCalificacion(fila) {
  const dentroDePlazo = Number(fila.dias_restantes) >= 0;
  const yaCalifique = Number(fila.ya_califique) > 0;

  return toOperacionDto({
    ...fila,
    ya_califique: yaCalifique,
    puede_calificar: dentroDePlazo && !yaCalifique,
    dias_restantes: dentroDePlazo ? Number(fila.dias_restantes) : null,
  });
}

/**
 * GET /api/operaciones?tipo=COMPRA|VENTA&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
 *
 * Punto 9: "historial de operaciones concretadas, separado en compras y
 * ventas" con "filtro por rango de fechas y por tipo de operación".
 *
 * Sin `tipo` vienen las dos listas separadas, que es como se dibuja la
 * pantalla con dos solapas.
 */
async function listarHistorial(usuarioId, query = {}) {
  const tipo = query.tipo ? String(query.tipo).toUpperCase() : null;
  if (tipo !== null && !TIPOS.includes(tipo)) {
    throw ApiError.badRequest(`El tipo debe ser uno de: ${TIPOS.join(', ')}`, 'TIPO_INVALIDO');
  }

  const desde = leerFecha(query.desde, 'desde');
  const hasta = leerFecha(query.hasta, 'hasta');
  if (desde && hasta && desde > hasta) {
    throw ApiError.badRequest(
      'La fecha "desde" no puede ser posterior a "hasta"',
      'RANGO_FECHAS_INVALIDO'
    );
  }

  const condiciones = ['(o.comprador_id = ? OR o.vendedor_id = ?)'];
  const parametros = [...paramsDeUsuario(usuarioId), usuarioId, usuarioId];

  if (desde) {
    condiciones.push('o.concretada_en >= ?');
    parametros.push(`${desde} 00:00:00`);
  }
  if (hasta) {
    // Hasta el final de ese día, si no "hasta hoy" dejaría afuera lo de hoy.
    condiciones.push('o.concretada_en <= ?');
    parametros.push(`${hasta} 23:59:59`);
  }
  if (tipo === 'COMPRA') {
    condiciones.push('o.comprador_id = ?');
    parametros.push(usuarioId);
  }
  if (tipo === 'VENTA') {
    condiciones.push('o.vendedor_id = ?');
    parametros.push(usuarioId);
  }

  const [filas] = await pool.query(
    `${SELECT_HISTORIAL} WHERE ${condiciones.join(' AND ')} ORDER BY o.concretada_en DESC`,
    parametros
  );

  const operaciones = filas.map(conEstadoDeCalificacion);
  if (tipo === 'COMPRA') return { compras: operaciones };
  if (tipo === 'VENTA') return { ventas: operaciones };

  return {
    compras: operaciones.filter((o) => o.tipo === 'COMPRA'),
    ventas: operaciones.filter((o) => o.tipo === 'VENTA'),
  };
}

/**
 * GET /api/operaciones/pendientes-calificar
 *
 * Las que todavía están dentro de los 7 días y no califiqué. Es lo que le
 * permite a la app mostrar el aviso de "tenés 2 operaciones para calificar"
 * sin bajarse el historial entero.
 */
async function pendientesDeCalificar(usuarioId) {
  const [filas] = await pool.query(
    `${SELECT_HISTORIAL}
      WHERE (o.comprador_id = ? OR o.vendedor_id = ?)
        AND DATE_ADD(o.concretada_en, INTERVAL ${DIAS_PARA_CALIFICAR} DAY) >= NOW()
        AND NOT EXISTS (
          SELECT 1 FROM calificaciones c
           WHERE c.operacion_id = o.id AND c.calificador_id = ?
        )
      ORDER BY o.concretada_en DESC`,
    [...paramsDeUsuario(usuarioId), usuarioId, usuarioId, usuarioId]
  );

  const operaciones = filas.map(conEstadoDeCalificacion);
  return { operaciones, total: operaciones.length };
}

function validarEstrellas(estrellas) {
  const valor = Number(estrellas);
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) {
    throw ApiError.badRequest(
      'Las estrellas van de 1 a 5',
      'ESTRELLAS_INVALIDAS'
    );
  }
  return valor;
}

function validarComentario(comentario) {
  if (comentario === undefined || comentario === null) return null;
  const limpio = String(comentario).trim();
  if (limpio === '') return null;
  if (limpio.length > COMENTARIO_MAX) {
    throw ApiError.badRequest(
      `El comentario no puede tener más de ${COMENTARIO_MAX} caracteres`,
      'COMENTARIO_LARGO'
    );
  }
  return limpio;
}

/**
 * POST /api/operaciones/:id/calificacion   { estrellas, comentario? }
 *
 * Punto 9: cada parte califica a la otra dentro de los 7 días. El rol se
 * deduce solo — si soy el comprador estoy calificando al vendedor, y al
 * revés — así que no se recibe del cliente: mandarlo sería dejar que la app
 * decida algo que el backend ya sabe.
 */
async function calificar(operacionId, usuarioId, { estrellas, comentario }) {
  const id = Number(operacionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de operación no es válido', 'ID_INVALIDO');
  }

  const [filas] = await pool.query(
    `SELECT o.*,
            DATEDIFF(DATE_ADD(o.concretada_en, INTERVAL ${DIAS_PARA_CALIFICAR} DAY), NOW())
              AS dias_restantes
       FROM operaciones o WHERE o.id = ? LIMIT 1`,
    [id]
  );
  const operacion = filas[0];
  if (!operacion) {
    throw ApiError.notFound('La operación no existe', 'OPERACION_NO_ENCONTRADA');
  }

  const soyComprador = operacion.comprador_id === usuarioId;
  const soyVendedor = operacion.vendedor_id === usuarioId;
  if (!soyComprador && !soyVendedor) {
    throw ApiError.forbidden('No participaste de esa operación', 'NO_SOS_PARTE');
  }

  if (Number(operacion.dias_restantes) < 0) {
    throw ApiError.conflict(
      `El plazo para calificar era de ${DIAS_PARA_CALIFICAR} días y ya pasó`,
      'PLAZO_VENCIDO'
    );
  }

  const [yaHay] = await pool.query(
    'SELECT id FROM calificaciones WHERE operacion_id = ? AND calificador_id = ? LIMIT 1',
    [id, usuarioId]
  );
  if (yaHay.length > 0) {
    throw ApiError.conflict('Ya calificaste esta operación', 'YA_CALIFICADA');
  }

  const valor = validarEstrellas(estrellas);
  const texto = validarComentario(comentario);
  const calificadoId = soyComprador ? operacion.vendedor_id : operacion.comprador_id;
  const rolCalificado = soyComprador ? 'VENDEDOR' : 'COMPRADOR';

  const [res] = await pool.query(
    `INSERT INTO calificaciones
       (operacion_id, calificador_id, calificado_id, rol_calificado, estrellas, comentario)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, usuarioId, calificadoId, rolCalificado, valor, texto]
  );

  const [creada] = await pool.query(
    `SELECT c.*, u.nombre AS calificador_nombre, p.titulo AS publicacion_titulo
       FROM calificaciones c
       JOIN usuarios u    ON u.id = c.calificador_id
       JOIN operaciones o ON o.id = c.operacion_id
       LEFT JOIN publicaciones p ON p.id = o.publicacion_id
      WHERE c.id = ?`,
    [res.insertId]
  );
  return { calificacion: toCalificacionDto(creada[0]) };
}

/**
 * GET /api/usuarios/:id/calificaciones
 *
 * Punto 9: "las calificaciones recibidas [...] quedan visibles en su perfil
 * público". Es público a propósito: se consulta antes de operar con alguien.
 */
async function calificacionesDe(usuarioId) {
  const id = Number(usuarioId);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de usuario no es válido', 'ID_INVALIDO');
  }

  const [filas] = await pool.query(
    `SELECT c.*, u.nombre AS calificador_nombre, p.titulo AS publicacion_titulo
       FROM calificaciones c
       JOIN usuarios u    ON u.id = c.calificador_id
       JOIN operaciones o ON o.id = c.operacion_id
       LEFT JOIN publicaciones p ON p.id = o.publicacion_id
      WHERE c.calificado_id = ?
      ORDER BY c.creado_en DESC`,
    [id]
  );
  return { calificaciones: filas.map(toCalificacionDto) };
}

module.exports = {
  listarHistorial,
  pendientesDeCalificar,
  calificar,
  calificacionesDe,
  DIAS_PARA_CALIFICAR,
};

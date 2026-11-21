// CAPA DE SERVICIO: Punto 12, cierre de la operación con QR.
//
// "El comprador escanea un código QR con la cámara para confirmar que recibió
// el artículo. El código QR es físico y no debe ser generado por la App. Lo
// importante es que se produzca esta acción para cerrar la operación."
//
// Cómo se reparte el trabajo:
//
//   - Al aceptarse una oferta (interaccionService.responderOferta) nace la
//     operación PENDIENTE_ENTREGA con un código único, y la publicación queda
//     RESERVADA. Ese código es lo que el vendedor imprime como QR
//     (`npm run qr -- RONDA-XXXXXXXX`) y entrega junto con el artículo.
//   - La app sólo lee el QR con la cámara y manda el texto a
//     POST /api/operaciones/confirmar-entrega. Acá se decide si el código es
//     válido, si quien lo escanea es el comprador de esa operación y si la
//     entrega no estaba confirmada ya.
//   - Confirmada, la operación pasa a CONCRETADA (desde ahí corren los 7 días
//     para calificar del Punto 9) y la publicación a VENDIDA.
//
// El código lo ve únicamente el vendedor: si el comprador lo viera en la app,
// podría cerrar la operación sin haber recibido nada.
const crypto = require('node:crypto');
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toCierreDto, toOperacionDto } = require('../dtos/operacionDto');
const { DIAS_PARA_CALIFICAR } = require('./operacionService');

// Sin 0/O ni 1/I: si el QR no se llega a leer y hay que tipear el código que
// está impreso debajo, que no haya dos caracteres que se confundan.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREFIJO = 'RONDA-';
const LARGO_CUERPO = 8;
const CODIGO_MAX = 20; // lo que entra en la columna

function codigoAlAzar() {
  let cuerpo = '';
  for (let i = 0; i < LARGO_CUERPO; i++) {
    cuerpo += ALFABETO[crypto.randomInt(ALFABETO.length)];
  }
  return PREFIJO + cuerpo;
}

/**
 * Un código que no esté usado. Lo llama responderOferta adentro de su
 * transacción, por eso recibe la conexión en vez de ir al pool.
 *
 * Con 32^8 combinaciones la colisión es casi imposible, pero "casi" no es
 * "nunca": se verifica igual, y la columna es UNIQUE por si dos aceptaciones
 * corren a la vez.
 */
async function generarCodigoEntrega(conexion) {
  for (let intento = 0; intento < 5; intento++) {
    const codigo = codigoAlAzar();
    const [filas] = await conexion.query(
      'SELECT 1 FROM operaciones WHERE codigo_entrega = ? LIMIT 1',
      [codigo]
    );
    if (filas.length === 0) return codigo;
  }
  throw new Error('No se pudo generar un código de entrega único');
}

/**
 * Lo que llegó del QR, limpio. Mayúsculas y sin espacios: un lector puede
 * agregar un salto de línea al final, y a mano se tipea como salga.
 */
function normalizarCodigo(valor) {
  if (valor === undefined || valor === null) return '';
  return String(valor).trim().toUpperCase().replace(/\s+/g, '');
}

const SELECT_CIERRE = `
  SELECT o.id, o.publicacion_id, o.oferta_id, o.vendedor_id, o.comprador_id, o.monto,
         o.estado, o.codigo_entrega, o.aceptada_en, o.concretada_en,
         p.titulo AS publicacion_titulo,
         p.estado AS publicacion_estado,
         (SELECT f.url FROM fotos_publicacion f
           WHERE f.publicacion_id = p.id ORDER BY f.orden, f.id LIMIT 1) AS foto_principal,
         uv.nombre AS vendedor_nombre,
         uc.nombre AS comprador_nombre
    FROM operaciones o
    LEFT JOIN publicaciones p ON p.id = o.publicacion_id
    JOIN usuarios uv ON uv.id = o.vendedor_id
    JOIN usuarios uc ON uc.id = o.comprador_id
`;

/**
 * El cierre de la operación de una publicación, visto por quien consulta.
 * null si no hay operación o si quien mira no es parte: a un tercero no le
 * corresponde saber si hay una entrega pendiente ni de quién.
 */
async function cierreDePublicacion(publicacionId, usuarioId) {
  if (!usuarioId) return null;
  const [filas] = await pool.query(
    `${SELECT_CIERRE}
      WHERE o.publicacion_id = ? AND (o.vendedor_id = ? OR o.comprador_id = ?)
      ORDER BY o.id DESC LIMIT 1`,
    [publicacionId, usuarioId, usuarioId]
  );
  return filas[0] ? toCierreDto(filas[0], usuarioId) : null;
}

/**
 * Los cierres de varias ofertas de una vez, para "Mis ofertas": una consulta
 * para toda la lista en vez de una por fila aceptada. Devuelve un Map por id
 * de oferta.
 */
async function cierresDeOfertas(ofertaIds, usuarioId) {
  const cierres = new Map();
  if (!usuarioId || ofertaIds.length === 0) return cierres;
  const [filas] = await pool.query(
    `${SELECT_CIERRE} WHERE o.oferta_id IN (${ofertaIds.map(() => '?').join(', ')})`,
    ofertaIds
  );
  for (const fila of filas) cierres.set(fila.oferta_id, toCierreDto(fila, usuarioId));
  return cierres;
}

/**
 * POST /api/operaciones/confirmar-entrega   { codigo }
 *
 * El orden de las validaciones es el de los mensajes que ve el comprador:
 * primero si el código existe, después si es suyo, después si ya se usó. Cada
 * caso tiene su código de error para que la app muestre "operación confirmada
 * o código inválido, con un mensaje descriptivo", como pide el enunciado.
 */
async function confirmarEntrega(usuarioId, codigoCrudo) {
  const codigo = normalizarCodigo(codigoCrudo);
  if (codigo === '') {
    throw ApiError.badRequest('Falta el código del QR', 'CODIGO_REQUERIDO');
  }
  if (codigo.length > CODIGO_MAX) {
    throw ApiError.badRequest('Eso no es un código de entrega de Ronda', 'CODIGO_INVALIDO');
  }

  const [filas] = await pool.query(`${SELECT_CIERRE} WHERE o.codigo_entrega = ? LIMIT 1`, [codigo]);
  const operacion = filas[0];
  if (!operacion) {
    throw ApiError.notFound(
      'Ese código no corresponde a ninguna entrega de Ronda. Fijate que sea el QR que te dio el vendedor.',
      'CODIGO_INVALIDO'
    );
  }
  if (operacion.comprador_id !== usuarioId) {
    throw ApiError.forbidden(
      operacion.vendedor_id === usuarioId
        ? 'Este código es el de tu venta: lo tiene que escanear el comprador cuando reciba el artículo'
        : 'Este código corresponde a la compra de otra persona',
      'NO_SOS_EL_COMPRADOR'
    );
  }
  if (operacion.estado === 'CONCRETADA') {
    throw ApiError.conflict('Esa entrega ya estaba confirmada', 'ENTREGA_YA_CONFIRMADA');
  }

  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    // El AND estado protege de dos escaneos casi simultáneos: el segundo no
    // actualiza nada y se corta acá.
    const [res] = await conexion.query(
      `UPDATE operaciones SET estado = 'CONCRETADA', concretada_en = NOW()
        WHERE id = ? AND estado = 'PENDIENTE_ENTREGA'`,
      [operacion.id]
    );
    if (res.affectedRows === 0) {
      throw ApiError.conflict('Esa entrega ya estaba confirmada', 'ENTREGA_YA_CONFIRMADA');
    }

    // "Al confirmarse, la publicación pasa automáticamente al estado vendida."
    if (operacion.publicacion_id !== null) {
      await conexion.query(
        `UPDATE publicaciones SET estado = 'VENDIDA' WHERE id = ?`,
        [operacion.publicacion_id]
      );
    }

    await conexion.commit();
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }

  const [actualizadas] = await pool.query(`${SELECT_CIERRE} WHERE o.id = ? LIMIT 1`, [operacion.id]);
  const fila = actualizadas[0];
  const titulo = fila.publicacion_titulo ?? 'el artículo';

  return {
    mensaje:
      `Operación confirmada: recibiste «${titulo}». La publicación pasó a vendida ` +
      `y la operación quedó registrada para vos y para ${fila.vendedor_nombre}.`,
    cierre: toCierreDto(fila, usuarioId),
    // La misma forma que una fila del historial del Punto 9, así la app la
    // muestra con lo que ya tiene. Recién concretada: todavía se puede calificar.
    operacion: toOperacionDto({
      ...fila,
      tipo: 'COMPRA',
      contraparte_id: fila.vendedor_id,
      contraparte_nombre: fila.vendedor_nombre,
      puede_calificar: true,
      ya_califique: false,
      dias_restantes: DIAS_PARA_CALIFICAR,
      mis_estrellas: null,
      estrellas_recibidas: null,
    }),
    publicacion:
      fila.publicacion_id === null
        ? null
        : { id: fila.publicacion_id, titulo: fila.publicacion_titulo, estado: fila.publicacion_estado },
  };
}

module.exports = {
  generarCodigoEntrega,
  normalizarCodigo,
  cierreDePublicacion,
  cierresDeOfertas,
  confirmarEntrega,
};

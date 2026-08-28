// Manejo centralizado de errores.
// Gracias a esto ningún controller necesita armar respuestas de error:
// tira un ApiError y este archivo decide el status y el JSON.
const ApiError = require('../utils/ApiError');
const config = require('../config/env');

// Se ejecuta cuando ninguna ruta hizo match.
function noEncontrado(req, res, next) {
  next(ApiError.notFound(`La ruta ${req.method} ${req.originalUrl} no existe`, 'RUTA_NO_ENCONTRADA'));
}

// Express reconoce este middleware como "de error" por tener 4 parámetros.
// eslint-disable-next-line no-unused-vars
function manejadorDeErrores(error, req, res, next) {
  // Errores propios de MySQL que sabemos traducir a algo entendible.
  if (error && error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: { codigo: 'EMAIL_EN_USO', mensaje: 'Ya existe una cuenta con ese email' },
    });
  }
  if (error && (error.code === 'ECONNREFUSED' || error.code === 'ER_ACCESS_DENIED_ERROR')) {
    console.error('[DB]', error.message);
    return res.status(503).json({
      error: { codigo: 'BASE_NO_DISPONIBLE', mensaje: 'No se pudo conectar a la base de datos' },
    });
  }

  // JSON mal formado enviado por el cliente.
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo del request no es JSON válido' },
    });
  }

  if (error instanceof ApiError) {
    return res.status(error.estado).json({
      error: { codigo: error.codigo, mensaje: error.message },
    });
  }

  // Cualquier otra cosa es un bug nuestro: lo logueamos completo
  // y devolvemos un mensaje genérico.
  console.error('[ERROR NO CONTROLADO]', error);
  return res.status(500).json({
    error: {
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrió un error inesperado',
      detalle: config.entorno === 'development' ? error.message : undefined,
    },
  });
}

module.exports = { noEncontrado, manejadorDeErrores };

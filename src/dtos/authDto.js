// DTOs de respuesta de los endpoints de autenticación.
// Cada función de acá define, literalmente, el JSON que va a recibir la app.
const { toUsuarioDto } = require('./usuarioDto');

// Respuesta de POST /auth/registro
function toRegistroDto(usuario, codigoDesarrollo) {
  return {
    mensaje: 'Te enviamos un código de verificación a tu email',
    usuario: toUsuarioDto(usuario),
    codigoDesarrollo, // undefined en producción, ver OTP_EXPOSE_IN_RESPONSE
  };
}

// Respuesta de POST /auth/otp/enviar
function toOtpEnviadoDto(codigoDesarrollo) {
  return {
    mensaje: 'Código enviado',
    codigoDesarrollo,
  };
}

// Respuesta de POST /auth/otp/verificar y de POST /auth/login.
// Las dos devuelven lo mismo a propósito: así el front tiene UNA sola clase
// (SesionResponse) para los dos caminos de ingreso.
function toSesionDto(usuario, token) {
  return {
    token,
    usuario: toUsuarioDto(usuario),
  };
}

// Respuesta de GET /auth/me
function toPerfilDto(usuario) {
  return {
    usuario: toUsuarioDto(usuario),
  };
}

module.exports = { toRegistroDto, toOtpEnviadoDto, toSesionDto, toPerfilDto };

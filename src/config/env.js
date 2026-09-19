// Lee el archivo .env y expone la configuracion tipada en un solo lugar.
// Regla: NINGUN otro archivo del proyecto lee process.env directamente.
require('dotenv').config();

function leer(nombre, porDefecto) {
  const valor = process.env[nombre] ?? porDefecto;
  if (valor === undefined || valor === '') {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copiá .env.example a .env y completala.`
    );
  }
  return valor;
}

module.exports = {
  puerto: Number(leer('PORT', 3000)),
  entorno: leer('NODE_ENV', 'development'),

  db: {
    host: leer('DB_HOST', 'localhost'),
    puerto: Number(leer('DB_PORT', 3306)),
    usuario: leer('DB_USER', 'root'),
    password: process.env.DB_PASSWORD ?? '',
    nombre: leer('DB_NAME', 'ronda'),
  },

  jwt: {
    secreto: leer('JWT_SECRET'),
    expiracion: leer('JWT_EXPIRES_IN', '7d'),
  },

  otp: {
    largo: Number(leer('OTP_LENGTH', 6)),
    minutosValidez: Number(leer('OTP_TTL_MINUTES', 10)),
    intentosMaximos: Number(leer('OTP_MAX_ATTEMPTS', 5)),
    segundosEntreEnvios: Number(leer('OTP_RESEND_COOLDOWN_SECONDS', 60)),
    exponerEnRespuesta: leer('OTP_EXPOSE_IN_RESPONSE', 'false') === 'true',
  },

  // Punto 7: cuanto vive una oferta antes de caducar sola.
  oferta: {
    horasDeVigencia: Number(leer('OFERTA_VIGENCIA_HORAS', 72)),
  },

  mail: {
    modo: leer('MAIL_MODE', 'console'), // 'console' | 'smtp'
    host: process.env.SMTP_HOST,
    puerto: Number(process.env.SMTP_PORT || 587),
    usuario: (process.env.SMTP_USER || '').trim(),
    // Google muestra la contraseña de aplicación como "abcd efgh ijkl mnop",
    // pero el SMTP la espera sin espacios: pegarla tal cual da un 535
    // BadCredentials que no explica nada. Se los sacamos nosotros, que es lo
    // que espera cualquiera que copie y pegue lo que Google le mostró.
    password: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    remitente: process.env.MAIL_FROM || 'Ronda <no-reply@ronda.app>',
  },
};

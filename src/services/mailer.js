// Envio del codigo OTP por email.
//
// Tiene DOS modos, controlados por MAIL_MODE en el .env:
//   console -> imprime el codigo en la terminal. No necesita configurar nada.
//              Ideal para desarrollar y para que tu equipo levante el proyecto
//              sin pedirte credenciales.
//   smtp    -> manda un mail de verdad con Nodemailer (Gmail App Password).
//              Para la demo frente al profesor.
const nodemailer = require('nodemailer');
const config = require('../config/env');

let transporte = null;

function obtenerTransporte() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.puerto,
      secure: config.mail.puerto === 465, // 465 = SSL, 587 = STARTTLS
      auth: {
        user: config.mail.usuario,
        pass: config.mail.password,
      },
    });
  }
  return transporte;
}

function plantillaHtml(codigo, proposito) {
  const titulo =
    proposito === 'REGISTRO' ? 'Confirmá tu cuenta' : 'Ingresá a tu cuenta';
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#1f2937">Ronda · ${titulo}</h2>
      <p>Tu código de verificación es:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#111827">${codigo}</p>
      <p style="color:#6b7280">Vence en ${config.otp.minutosValidez} minutos.
      Si no pediste este código, ignorá este mensaje.</p>
    </div>`;
}

async function enviarCodigoOtp(destino, codigo, proposito) {
  if (config.mail.modo !== 'smtp') {
    console.log('');
    console.log('=============== CÓDIGO OTP (modo consola) ===============');
    console.log(`  Para:      ${destino}`);
    console.log(`  Propósito: ${proposito}`);
    console.log(`  Código:    ${codigo}`);
    console.log(`  Vence en:  ${config.otp.minutosValidez} minutos`);
    console.log('=========================================================');
    console.log('');
    return;
  }

  await obtenerTransporte().sendMail({
    from: config.mail.remitente,
    to: destino,
    subject:
      proposito === 'REGISTRO'
        ? 'Confirmá tu cuenta en Ronda'
        : 'Tu código para ingresar a Ronda',
    text: `Tu código es ${codigo}. Vence en ${config.otp.minutosValidez} minutos.`,
    html: plantillaHtml(codigo, proposito),
  });
}

module.exports = { enviarCodigoOtp };

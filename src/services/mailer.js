// Envio del codigo OTP por email (Punto 1).
//
// Tiene DOS modos, controlados por MAIL_MODE en el .env:
//   console -> imprime el codigo en la terminal. No necesita configurar nada.
//              Ideal para desarrollar y para que tu equipo levante el proyecto
//              sin pedirte credenciales.
//   smtp    -> manda un mail de verdad con Nodemailer (Gmail App Password).
//              Para la demo frente al profesor.
//
// En los dos modos, mientras NODE_ENV no sea production, el codigo tambien
// se escribe en la terminal. Con smtp eso es lo unico que permite probar con
// un email que no sea el propio: el codigo le llega a la casilla de la
// cuenta que se registra, asi que registrarse como pepe@ejemplo.com dejaria
// el flujo trabado sin forma de seguir.
//
// Como configurar el modo smtp con Gmail:
//   1. Activar la verificacion en dos pasos en la cuenta de Google.
//   2. Ir a https://myaccount.google.com/apppasswords y generar una
//      "contraseña de aplicacion" de 16 caracteres. NO sirve la contraseña
//      normal de la cuenta: Google bloquea el acceso SMTP con esa.
//   3. En el .env:  MAIL_MODE=smtp
//                   SMTP_USER=tu.cuenta@gmail.com
//                   SMTP_PASS=la contraseña de aplicacion
//                   MAIL_FROM=Hallado <tu.cuenta@gmail.com>
//
// Ojo con MAIL_FROM: Gmail reescribe el remitente al de la cuenta autenticada.
// Poner un dominio ajeno (no-reply@ronda.app) hace que el mail caiga en spam,
// asi que conviene usar la misma direccion con la que uno se autentica.
const nodemailer = require('nodemailer');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

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

/**
 * Prueba la conexion al SMTP al arrancar.
 *
 * Sin esto, un usuario o una contraseña mal puestos recien se descubren
 * cuando alguien intenta registrarse — en plena demo. Verificarlo al inicio
 * convierte ese error en un mensaje claro en la terminal.
 *
 * Nunca tira: si falla, avisa y el servidor arranca igual. Que no ande el
 * mail no es motivo para dejar la API entera abajo.
 */
async function verificarConfiguracion() {
  if (config.mail.modo !== 'smtp') {
    return { ok: true, modo: 'console' };
  }

  if (!config.mail.host || !config.mail.usuario || !config.mail.password) {
    return {
      ok: false,
      modo: 'smtp',
      detalle: 'Faltan SMTP_HOST, SMTP_USER o SMTP_PASS en el .env',
    };
  }

  try {
    await obtenerTransporte().verify();
    return { ok: true, modo: 'smtp', detalle: config.mail.usuario };
  } catch (error) {
    return { ok: false, modo: 'smtp', detalle: error.message };
  }
}

const TITULOS_OTP = {
  REGISTRO: 'Confirmá tu cuenta',
  LOGIN: 'Ingresá a tu cuenta',
  CAMBIO_EMAIL: 'Confirmá tu nuevo email',
  RECUPERO: 'Recuperá tu contraseña',
};

// El nombre va en una sola constante. La primera versión lo tenía escrito en
// cuatro strings distintos, y al renombrar la app a Hallado quedaron mails
// diciendo "Ronda" cuando la pantalla ya decía otra cosa.
const APP = 'Hallado';

const ASUNTOS_OTP = {
  REGISTRO: `Confirmá tu cuenta en ${APP}`,
  LOGIN: `Tu código para ingresar a ${APP}`,
  CAMBIO_EMAIL: `Confirmá tu nuevo email en ${APP}`,
  RECUPERO: 'Tu código para recuperar la contraseña',
};

function plantillaHtml(codigo, proposito) {
  const titulo = TITULOS_OTP[proposito] || TITULOS_OTP.LOGIN;
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#1B6E4F">${APP} · ${titulo}</h2>
      <p>Tu código de verificación es:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#111827">${codigo}</p>
      <p style="color:#6b7280">Vence en ${config.otp.minutosValidez} minutos.
      Si no pediste este código, ignorá este mensaje.</p>
    </div>`;
}

// Imprime el codigo en la terminal.
//
// `nota` cuenta por que esta apareciendo: cambia si el mail no se mando
// (modo consola), si se mando igual (copia para poder probar) o si fallo.
function imprimirEnConsola(destino, codigo, proposito, nota) {
  console.log('');
  console.log('=================== CÓDIGO OTP ==========================');
  console.log(`  Para:      ${destino}`);
  console.log(`  Propósito: ${proposito}`);
  console.log(`  Código:    ${codigo}`);
  console.log(`  Vence en:  ${config.otp.minutosValidez} minutos`);
  if (nota) console.log(`  ${nota}`);
  console.log('=========================================================');
  console.log('');
}

// Fuera de produccion el codigo SIEMPRE se escribe en la terminal, aunque el
// mail se haya mandado bien.
//
// Es la unica forma de probar con un email que no sea el tuyo. Con
// MAIL_MODE=smtp el codigo le llega a la casilla de la cuenta que se esta
// registrando, asi que si uno prueba con pepe@ejemplo.com el codigo se va a
// un buzon al que no tiene acceso y el registro queda trabado.
//
// En produccion no se imprime nunca: seria dejar los codigos escritos en los
// logs del servidor, donde los ve cualquiera que tenga acceso a la maquina.
const mostrarCodigoEnTerminal = config.entorno !== 'production';

async function enviarCodigoOtp(destino, codigo, proposito) {
  if (config.mail.modo !== 'smtp') {
    imprimirEnConsola(destino, codigo, proposito, 'MAIL_MODE=console: no se envió ningún mail.');
    return;
  }

  try {
    await obtenerTransporte().sendMail({
      from: config.mail.remitente,
      to: destino,
      subject: ASUNTOS_OTP[proposito] || ASUNTOS_OTP.LOGIN,
      text: `Tu código es ${codigo}. Vence en ${config.otp.minutosValidez} minutos.`,
      html: plantillaHtml(codigo, proposito),
    });

    if (mostrarCodigoEnTerminal) {
      imprimirEnConsola(destino, codigo, proposito, 'El mail salió. Esta copia es para poder probar con otras casillas.');
    }
  } catch (error) {
    // El codigo ya quedo guardado en la base antes de llegar aca. Si el envio
    // falla y no hacemos nada, la persona espera un mail que no va a llegar
    // y no entiende por que.
    console.error('ERROR  No pude enviar el mail del OTP:', error.message);

    // En desarrollo mostramos el codigo igual, asi una caida del SMTP no deja
    // al equipo sin poder entrar. En produccion eso seria filtrarlo en los logs.
    if (mostrarCodigoEnTerminal) {
      imprimirEnConsola(destino, codigo, proposito, 'El mail NO salió. El código sirve igual.');
      return;
    }

    throw new ApiError(
      502,
      'No pudimos enviar el código a tu email. Probá de nuevo en un momento.',
      'MAIL_NO_ENVIADO'
    );
  }
}

module.exports = { enviarCodigoOtp, verificarConfiguracion };

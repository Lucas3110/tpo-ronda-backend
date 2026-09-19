// Prueba que el envío del OTP por email esté bien configurado.
//
//   npm run test:mail                      -> se manda a SMTP_USER
//   npm run test:mail -- otro@mail.com     -> a otra dirección
//
// No necesita que la API esté levantada: usa el mismo mailer que usa el
// backend, así que si esto anda, el OTP del registro y del login también.
const config = require('../src/config/env');
const { enviarCodigoOtp, verificarConfiguracion } = require('../src/services/mailer');

async function main() {
  const destino = process.argv[2] || config.mail.usuario;

  console.log('');
  console.log(`Modo de mail: ${config.mail.modo}`);

  if (config.mail.modo !== 'smtp') {
    console.log('');
    console.log('Está en modo "console": el código se imprime en la terminal y');
    console.log('no se manda ningún mail. Para probar el envío real poné');
    console.log('MAIL_MODE=smtp en el .env.');
    console.log('');
    return;
  }

  console.log(`Cuenta:       ${config.mail.usuario}`);
  console.log(`Destino:      ${destino}`);
  console.log('');

  process.stdout.write('Conectando al SMTP... ');
  const estado = await verificarConfiguracion();
  if (!estado.ok) {
    console.log('FALLÓ');
    console.log('');
    console.log(`  ${estado.detalle}`);
    console.log('');
    if (/Username and Password not accepted|BadCredentials/i.test(estado.detalle)) {
      console.log('  Eso es casi siempre una de estas dos:');
      console.log('    - Pusiste la contraseña normal de Gmail en vez de una');
      console.log('      "contraseña de aplicación" de 16 caracteres.');
      console.log('    - Copiaste la contraseña con espacios o incompleta.');
      console.log('');
      console.log('  Se generan en https://myaccount.google.com/apppasswords');
      console.log('  (hace falta tener la verificación en dos pasos activada).');
    }
    console.log('');
    process.exitCode = 1;
    return;
  }
  console.log('OK');

  process.stdout.write('Enviando un código de prueba... ');
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  await enviarCodigoOtp(destino, codigo, 'REGISTRO');
  console.log('OK');

  console.log('');
  console.log(`Revisá ${destino}. El código enviado fue ${codigo}.`);
  console.log('Si no aparece en unos segundos, mirá la carpeta de spam.');
  console.log('');
}

main().catch((error) => {
  console.error('');
  console.error('No pude enviar el mail:', error.message);
  console.error('');
  process.exitCode = 1;
});

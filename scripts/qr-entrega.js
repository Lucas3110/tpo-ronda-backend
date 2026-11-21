// Punto 12: imprime el QR de un código de entrega.
//
//   npm run qr -- RONDA-XXXXXXXX              -> qr-RONDA-XXXXXXXX.png
//   npm run qr -- RONDA-XXXXXXXX salida.png
//
// El enunciado pide que el QR sea físico y que la app no lo genere. Esto es
// lo que haría Ronda del lado del vendedor: tomar el código que nació al
// aceptarse la oferta (lo ve en "Mis ofertas") y dejarlo listo para imprimir
// y pegar en el paquete. El QR contiene el código tal cual, nada más: lo que
// la app lee es exactamente lo que después manda a POST /operaciones/confirmar-entrega.
const path = require('node:path');
const QRCode = require('qrcode');

async function main() {
  const [codigo, salida] = process.argv.slice(2);
  if (!codigo) {
    console.error('Uso: npm run qr -- RONDA-XXXXXXXX [archivo.png]');
    process.exit(1);
  }

  const texto = codigo.trim().toUpperCase();
  const archivo = salida || `qr-${texto}.png`;

  // En la terminal, para verlo al instante (y escanearlo de la pantalla).
  console.log(await QRCode.toString(texto, { type: 'terminal', small: true }));
  console.log(`  ${texto}`);

  // Y en PNG, que es lo que se imprime o se carga en la cámara del emulador.
  await QRCode.toFile(archivo, texto, { type: 'png', scale: 10, margin: 2 });
  console.log(`\nQR guardado en ${path.resolve(archivo)}`);
}

main().catch((error) => {
  console.error('No se pudo generar el QR:', error.message);
  process.exit(1);
});

// Punto de entrada: valida la conexión a MySQL y levanta el servidor HTTP.
const os = require('node:os');
const app = require('./app');
const config = require('./config/env');
const { probarConexion } = require('./config/db');

function ipsDeRed() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

async function iniciar() {
  try {
    await probarConexion();
    console.log(`OK  Conectado a MySQL (${config.db.host}:${config.db.puerto}/${config.db.nombre})`);
  } catch (error) {
    console.error('ERROR  No pude conectar a MySQL:', error.message);
    console.error('       Revisá que el servicio MySQL80 esté iniciado y que');
    console.error('       DB_USER / DB_PASSWORD / DB_NAME del .env sean correctos.');
    process.exit(1);
  }

  // 0.0.0.0 = escuchar en todas las interfaces.
  // Es lo que permite que un celular en la misma WiFi llegue a la API.
  app.listen(config.puerto, '0.0.0.0', () => {
    console.log('');
    console.log(`API escuchando en el puerto ${config.puerto}`);
    console.log(`  PC              -> http://localhost:${config.puerto}/api/health`);
    console.log(`  Emulador Android-> http://10.0.2.2:${config.puerto}/api/health`);
    for (const ip of ipsDeRed()) {
      console.log(`  Celular (WiFi)  -> http://${ip}:${config.puerto}/api/health`);
    }
    console.log(`  Modo de mail    -> ${config.mail.modo}`);
    console.log('');
  });
}

iniciar();

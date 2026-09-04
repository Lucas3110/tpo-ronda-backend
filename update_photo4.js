const mysql = require('mysql2/promise');
const config = require('./src/config/env');

async function main() {
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.puerto,
    user: config.db.usuario,
    password: config.db.password,
    database: config.db.nombre
  });
  
  // Update the photos for publication 48 directly
  await connection.query("UPDATE fotos_publicacion SET url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Samsung_SyncMaster_940BW_2.jpg/800px-Samsung_SyncMaster_940BW_2.jpg' WHERE publicacion_id = 48 AND orden = 0");
  
  await connection.end();
}
main();

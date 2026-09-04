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
  
  await connection.query("UPDATE fotos_publicacion SET url = 'https://picsum.photos/seed/samsung/800/600' WHERE publicacion_id = 48 AND orden = 0");
  await connection.query("UPDATE fotos_publicacion SET url = 'https://picsum.photos/seed/samsung2/800/600' WHERE publicacion_id = 48 AND orden = 1");
  
  await connection.end();
}
main();

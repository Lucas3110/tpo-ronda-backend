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
  
  const [rows] = await connection.query("SELECT * FROM fotos_publicacion WHERE publicacion_id = 48");
  console.log(rows);
  
  await connection.end();
}
main();

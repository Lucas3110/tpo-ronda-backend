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
  await connection.query("UPDATE fotos_publicacion SET url = 'https://images.samsung.com/is/image/samsung/p6pim/ar/lc24f390fhlczb/gallery/ar-24-inch-curved-monitor-cf390-lc24f390fhlczb-532671511?$650_519_PNG$' WHERE publicacion_id = 48 AND orden = 0");
  
  await connection.end();
}
main();

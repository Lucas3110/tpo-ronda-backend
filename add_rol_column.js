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
  
  try {
    await connection.query("ALTER TABLE usuarios ADD COLUMN rol ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER'");
    console.log("Column 'rol' added successfully.");
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log("Column 'rol' already exists.");
    } else {
      console.error(err);
    }
  }
  
  await connection.end();
}
main();

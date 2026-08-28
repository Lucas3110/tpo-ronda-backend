// Crea la base de datos y las tablas sin necesidad de tener el cliente
// `mysql` en la línea de comandos ni de abrir Workbench / phpMyAdmin.
//
//   npm run db:setup
//
// Funciona igual contra MySQL Server que contra el MariaDB que trae XAMPP.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const config = require('../src/config/env');

const ARCHIVO_SQL = path.join(__dirname, '..', 'sql', '01_schema.sql');

async function main() {
  console.log('');
  console.log('Preparando la base de datos...');
  console.log(`  Servidor : ${config.db.host}:${config.db.puerto}`);
  console.log(`  Usuario  : ${config.db.usuario}`);
  console.log(`  Base     : ${config.db.nombre}`);
  console.log('');

  if (config.db.nombre !== 'ronda') {
    console.warn(
      `AVISO: DB_NAME es "${config.db.nombre}" pero sql/01_schema.sql crea la base "ronda".\n` +
        '       Cambiá el nombre en el .sql o volvé a poner DB_NAME=ronda.\n'
    );
  }

  const sql = fs.readFileSync(ARCHIVO_SQL, 'utf8');

  let conexion;
  try {
    // Nos conectamos SIN elegir base: la base todavía puede no existir.
    conexion = await mysql.createConnection({
      host: config.db.host,
      port: config.db.puerto,
      user: config.db.usuario,
      password: config.db.password,
      multipleStatements: true, // el .sql tiene varias sentencias seguidas
    });
  } catch (error) {
    console.error('No pude conectarme al servidor de base de datos.');
    console.error(`  Detalle: ${error.message}`);
    console.error('');
    if (error.code === 'ECONNREFUSED') {
      console.error('  El servidor no está corriendo. Opciones:');
      console.error('   - XAMPP: abrí el Control Panel y tocá "Start" en MySQL.');
      console.error('   - MySQL Server: ejecutá "net start MySQL80" como Administrador.');
    }
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('  Usuario o contraseña incorrectos: revisá DB_USER y DB_PASSWORD en el .env.');
      console.error('  (En XAMPP el usuario es "root" y la contraseña está vacía.)');
    }
    process.exit(1);
  }

  try {
    await conexion.query(sql);

    const [tablas] = await conexion.query(
      `SELECT TABLE_NAME AS tabla
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME`,
      [config.db.nombre]
    );

    console.log('Base de datos lista. Tablas creadas:');
    for (const fila of tablas) {
      console.log(`  - ${fila.tabla}`);
    }
    console.log('');
    console.log('Siguiente paso:  npm run dev');
    console.log('');
  } catch (error) {
    console.error('El script SQL falló.');
    console.error(`  Detalle: ${error.message}`);
    process.exit(1);
  } finally {
    await conexion.end();
  }
}

main();

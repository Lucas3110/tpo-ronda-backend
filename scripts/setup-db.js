// Crea la base de datos y las tablas sin necesidad de tener el cliente
// `mysql` en la línea de comandos ni de abrir Workbench / phpMyAdmin.
//
//   npm run db:setup
//
// Ejecuta TODOS los archivos de sql/ en orden alfabético (01_, 02_, ...).
// Cada punto de la consigna agrega el suyo, y todos están escritos con
// CREATE TABLE IF NOT EXISTS / INSERT IGNORE, así que volver a correr el
// script sobre una base ya creada no rompe ni borra nada.
//
// Funciona igual contra MySQL Server que contra el MariaDB que trae XAMPP.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const config = require('../src/config/env');

const CARPETA_SQL = path.join(__dirname, '..', 'sql');

function archivosSql() {
  return fs
    .readdirSync(CARPETA_SQL)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort();
}

async function main() {
  console.log('');
  console.log('Preparando la base de datos...');
  console.log(`  Servidor : ${config.db.host}:${config.db.puerto}`);
  console.log(`  Usuario  : ${config.db.usuario}`);
  console.log(`  Base     : ${config.db.nombre}`);
  console.log('');

  if (config.db.nombre !== 'ronda') {
    console.warn(
      `AVISO: DB_NAME es "${config.db.nombre}" pero los scripts crean la base "ronda".\n` +
        '       Cambiá el nombre en los .sql o volvé a poner DB_NAME=ronda.\n'
    );
  }

  const archivos = archivosSql();
  if (archivos.length === 0) {
    console.error(`No encontré ningún archivo .sql en ${CARPETA_SQL}`);
    process.exit(1);
  }

  let conexion;
  try {
    // Nos conectamos SIN elegir base: la base todavía puede no existir.
    conexion = await mysql.createConnection({
      host: config.db.host,
      port: config.db.puerto,
      user: config.db.usuario,
      password: config.db.password,
      multipleStatements: true, // cada .sql tiene varias sentencias seguidas
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
    for (const archivo of archivos) {
      const sql = fs.readFileSync(path.join(CARPETA_SQL, archivo), 'utf8');
      await conexion.query(sql);
      console.log(`  ejecutado  ${archivo}`);
    }

    const [tablas] = await conexion.query(
      `SELECT TABLE_NAME AS tabla, TABLE_ROWS AS filas
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME`,
      [config.db.nombre]
    );

    console.log('');
    console.log(`Base de datos lista. ${tablas.length} tablas:`);
    for (const fila of tablas) {
      console.log(`  - ${fila.tabla}`);
    }
    console.log('');
    console.log('Siguiente paso:  npm run dev');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('Un script SQL falló.');
    console.error(`  Detalle: ${error.message}`);
    process.exit(1);
  } finally {
    await conexion.end();
  }
}

main();

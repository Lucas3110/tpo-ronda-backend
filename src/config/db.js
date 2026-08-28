// Pool de conexiones a MySQL.
// Un "pool" es un conjunto de conexiones reutilizables: en vez de abrir y
// cerrar una conexion por cada consulta (lento), el pool las presta y las
// devuelve. Se crea UNA sola vez para toda la app.
const mysql = require('mysql2/promise');
const config = require('./env');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.puerto,
  user: config.db.usuario,
  password: config.db.password,
  database: config.db.nombre,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Se llama al arrancar el servidor para fallar rapido y con un mensaje
// claro si MySQL esta apagado o las credenciales estan mal.
async function probarConexion() {
  const conexion = await pool.getConnection();
  try {
    await conexion.ping();
  } finally {
    conexion.release();
  }
}

module.exports = { pool, probarConexion };

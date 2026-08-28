// Construcción de la aplicación Express (sin arrancar el servidor).
// Separado de server.js para poder testear la app sin abrir un puerto.
const express = require('express');
const cors = require('cors');

const rutas = require('./routes');
const { noEncontrado, manejadorDeErrores } = require('./middlewares/errores');

const app = express();

// CORS abierto: la app Android no lo necesita, pero sirve si alguien
// prueba la API desde el navegador o desde un front web.
app.use(cors());

// Parsea el body JSON de los requests y lo deja en req.body.
app.use(express.json());

// Log simple de cada request, muy útil para ver si el celular llega.
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method} ${req.originalUrl}`);
  next();
});

app.use('/api', rutas);

// El orden importa: primero las rutas, después el 404, y al final los errores.
app.use(noEncontrado);
app.use(manejadorDeErrores);

module.exports = app;

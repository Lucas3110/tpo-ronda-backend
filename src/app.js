// Construcción de la aplicación Express (sin arrancar el servidor).
// Separado de server.js para poder testear la app sin abrir un puerto.
const express = require('express');
const cors = require('cors');

const rutas = require('./routes');
const fotos = require('./services/halladoFotoService');
const { noEncontrado, manejadorDeErrores } = require('./middlewares/errores');

const app = express();

// CORS abierto: la app Android no lo necesita, pero sirve si alguien
// prueba la API desde el navegador o desde un front web.
app.use(cors());

// Parsea el body JSON de los requests y lo deja en req.body.
//
// El límite por defecto de express.json() son 100 KB, y las fotos de Hallado
// viajan en base64 adentro del JSON. Una imagen de 4 MB son ~5,5 MB de texto,
// así que con el default toda subida rebotaba con un 413 antes de llegar al
// service. El tope real de las imágenes lo pone halladoFotoService.
app.use(express.json({ limit: '8mb' }));

// Log simple de cada request, muy útil para ver si el celular llega.
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method} ${req.originalUrl}`);
  next();
});

// Las fotos que sube la app. Van fuera de /api porque no son JSON: son
// archivos, y el <Image> de React Native los pide como cualquier imagen.
//
// La carpeta está en el .gitignore: son archivos que sube cada uno al
// probar, no código del proyecto.
app.use(
  fotos.RUTA_PUBLICA,
  express.static(fotos.CARPETA, {
    // Son inmutables: el nombre lleva un hash al azar, así que una URL
    // siempre apunta al mismo archivo.
    maxAge: '30d',
    // Sin esto, pedir /uploads/ sin nombre listaría la carpeta entera.
    index: false,
    fallthrough: true,
  })
);

app.use('/api', rutas);

// El orden importa: primero las rutas, después el 404, y al final los errores.
app.use(noEncontrado);
app.use(manejadorDeErrores);

module.exports = app;

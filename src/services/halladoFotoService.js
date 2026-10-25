// Subida de fotos de Hallado.
//
// Por qué así y no de otra forma
// ------------------------------
// La app manda la imagen en base64 dentro de un JSON normal, el backend la
// decodifica, la escribe como archivo y devuelve una URL. Después todo el
// resto del sistema trabaja con URLs.
//
// La alternativa de guardar el base64 en la base no sirve acá: una foto de
// 2 MB son ~2,7 MB de texto, y el listado del punto 3 muestra la portada de
// cada resultado. Una página de 20 resultados pesaría decenas de megas, y es
// la pantalla principal de la app.
//
// La otra alternativa, multipart con multer, obliga a sumar una dependencia y
// a manejar otro tipo de request, cuando `expo-image-picker` ya devuelve el
// base64 servido si se lo pedís. No gana nada a cambio.
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const ApiError = require('../utils/ApiError');

// Dentro del repo y fuera de git (está en el .gitignore): son archivos que
// sube cada uno al probar, no código.
const CARPETA = path.join(__dirname, '..', '..', 'uploads');
const RUTA_PUBLICA = '/uploads';

// 4 MB ya decodificados. Con la calidad que manda la app (0.6 y 1600px de
// lado mayor) una foto ronda los 300 KB, así que es holgado y a la vez evita
// que alguien mande un archivo de 50 MB.
const MAX_BYTES = 4 * 1024 * 1024;

// Sólo formatos que un <Image> de React Native sabe mostrar. Nada de SVG:
// un SVG es un documento con scripts adentro, no una foto.
const TIPOS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Los primeros bytes de cada formato. Se chequean porque el mime lo manda el
// cliente y puede decir cualquier cosa: sin esto, alguien sube un archivo
// arbitrario con mime 'image/png' y nos queda servido desde nuestro dominio.
const FIRMAS = [
  { extension: '.jpg', bytes: [0xff, 0xd8, 0xff] },
  { extension: '.png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { extension: '.webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
];

function detectarPorContenido(buffer) {
  for (const firma of FIRMAS) {
    if (firma.bytes.every((byte, i) => buffer[i] === byte)) {
      // WEBP es RIFF seguido de 4 bytes de tamaño y después "WEBP".
      if (firma.extension === '.webp' && buffer.subarray(8, 12).toString() !== 'WEBP') {
        continue;
      }
      return firma.extension;
    }
  }
  return null;
}

// POST /api/hallado/fotos
async function subir(usuarioId, { base64, mime }) {
  const tipo = String(mime ?? '').trim().toLowerCase();
  if (!TIPOS[tipo]) {
    throw ApiError.badRequest(
      `El formato tiene que ser uno de: ${Object.keys(TIPOS).join(', ')}`,
      'FORMATO_NO_SOPORTADO'
    );
  }

  const contenido = String(base64 ?? '').trim();
  if (contenido === '') {
    throw ApiError.badRequest('Falta la imagen', 'IMAGEN_REQUERIDA');
  }

  // El picker a veces devuelve el "data:image/jpeg;base64," adelante.
  const limpio = contenido.replace(/^data:[^;]+;base64,/, '');

  let buffer;
  try {
    buffer = Buffer.from(limpio, 'base64');
  } catch {
    throw ApiError.badRequest('La imagen no está bien codificada', 'IMAGEN_INVALIDA');
  }

  // No hay piso de tamaño: quien decide si esto es una imagen o basura es la
  // firma de los primeros bytes, más abajo. Un piso en bytes sólo serviría
  // para rechazar imágenes chiquitas legítimas (un PNG de 1x1 pesa 70 bytes).
  if (buffer.length > MAX_BYTES) {
    throw ApiError.badRequest(
      `La imagen no puede pesar más de ${Math.round(MAX_BYTES / 1024 / 1024)} MB`,
      'IMAGEN_MUY_GRANDE'
    );
  }

  const extensionReal = detectarPorContenido(buffer);
  if (extensionReal === null) {
    throw ApiError.badRequest(
      'Ese archivo no es una imagen JPG, PNG ni WEBP',
      'IMAGEN_INVALIDA'
    );
  }

  await fs.mkdir(CARPETA, { recursive: true });

  // Nombre al azar: si usáramos el que manda el cliente, dos personas que
  // suben "foto.jpg" se pisan, y un nombre con "../" se escapa de la carpeta.
  const nombre = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extensionReal}`;
  await fs.writeFile(path.join(CARPETA, nombre), buffer);

  return {
    url: `${RUTA_PUBLICA}/${nombre}`,
    bytes: buffer.length,
  };
}

module.exports = { subir, CARPETA, RUTA_PUBLICA };

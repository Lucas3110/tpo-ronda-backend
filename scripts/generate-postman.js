// Genera la colección de Postman a partir de la definición de endpoints que
// está más abajo, para no mantener a mano un JSON de 400 líneas.
//
//   npm run postman
//
// Produce dos archivos en /postman:
//   Ronda-API.postman_collection.json    -> Import en Postman
//   Ronda-Local.postman_environment.json -> Import y seleccionar arriba a la derecha
//
// La colección guarda sola el token y el código OTP en variables, así que se
// puede correr de arriba a abajo sin copiar y pegar nada.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SALIDA = path.join(__dirname, '..', 'postman');

// Los IDs se derivan del nombre con un hash, en vez de ser aleatorios.
// Así el archivo generado es idéntico en cada corrida y no ensucia el diff de git.
function idEstable(texto) {
  const h = crypto.createHash('md5').update(texto).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Script de test que se ejecuta después de cada request.
// pm.collectionVariables.set(...) guarda un valor para los requests siguientes.
function guardar(asignaciones, chequeoEstado) {
  const lineas = [
    `pm.test("Status ${chequeoEstado}", function () {`,
    `    pm.expect(pm.response.code).to.eql(${chequeoEstado});`,
    '});',
    '',
    'if (pm.response.code < 300) {',
    '    const data = pm.response.json();',
    ...asignaciones.map((a) => `    if (${a.desde}) pm.collectionVariables.set("${a.variable}", ${a.desde});`),
    '}',
  ];
  return lineas;
}

function request({ nombre, descripcion, metodo, ruta, body, auth, tests }) {
  const item = {
    name: nombre,
    id: idEstable(nombre),
    request: {
      method: metodo,
      header: [],
      url: {
        raw: `{{baseUrl}}/${ruta}`,
        host: ['{{baseUrl}}'],
        path: ruta.split('/'),
      },
      description: descripcion,
    },
  };

  if (body) {
    item.request.header.push({ key: 'Content-Type', value: 'application/json' });
    item.request.body = {
      mode: 'raw',
      raw: JSON.stringify(body, null, 2),
      options: { raw: { language: 'json' } },
    };
  }

  if (auth) {
    item.request.header.push({ key: 'Authorization', value: 'Bearer {{token}}' });
  }

  if (tests) {
    item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }];
  }

  return item;
}

// ---------------------------------------------------------------
// Definición de la colección
// ---------------------------------------------------------------
const carpetas = [
  {
    name: 'Salud',
    item: [
      request({
        nombre: 'GET /health',
        descripcion: 'Chequea que la API esté levantada.',
        metodo: 'GET',
        ruta: 'api/health',
        tests: guardar([], 200),
      }),
    ],
  },
  {
    name: '1 · Registro y OTP',
    item: [
      request({
        nombre: 'POST /auth/registro',
        descripcion:
          'Crea la cuenta y envía el primer código OTP.\n\n' +
          'Guarda automáticamente el código en la variable {{codigo}} ' +
          '(sólo funciona con OTP_EXPOSE_IN_RESPONSE=true).',
        metodo: 'POST',
        ruta: 'api/auth/registro',
        body: { email: '{{email}}', password: '{{password}}', nombre: 'Lucas' },
        tests: guardar([{ variable: 'codigo', desde: 'data.codigoDesarrollo' }], 201),
      }),
      request({
        nombre: 'POST /auth/otp/enviar — reenviar (REGISTRO)',
        descripcion:
          'Reenvía el código de registro. Si lo mandás dos veces seguidas ' +
          'responde 429 OTP_COOLDOWN: es el anti-spam de 60 segundos.',
        metodo: 'POST',
        ruta: 'api/auth/otp/enviar',
        body: { email: '{{email}}', proposito: 'REGISTRO' },
        tests: guardar([{ variable: 'codigo', desde: 'data.codigoDesarrollo' }], 200),
      }),
      request({
        nombre: 'POST /auth/otp/verificar — confirmar cuenta',
        descripcion:
          'Valida el código, marca el email como verificado y devuelve el token. ' +
          'Guarda el token en {{token}}.',
        metodo: 'POST',
        ruta: 'api/auth/otp/verificar',
        body: { email: '{{email}}', codigo: '{{codigo}}', proposito: 'REGISTRO' },
        tests: guardar([{ variable: 'token', desde: 'data.token' }], 200),
      }),
    ],
  },
  {
    name: '2 · Login',
    item: [
      request({
        nombre: 'POST /auth/login — email y contraseña',
        descripcion: 'Login clásico. Guarda el token en {{token}}.',
        metodo: 'POST',
        ruta: 'api/auth/login',
        body: { email: '{{email}}', password: '{{password}}' },
        tests: guardar([{ variable: 'token', desde: 'data.token' }], 200),
      }),
      request({
        nombre: 'POST /auth/otp/enviar — login por código',
        descripcion: 'Camino alternativo del enunciado: ingresar sin contraseña.',
        metodo: 'POST',
        ruta: 'api/auth/otp/enviar',
        body: { email: '{{email}}', proposito: 'LOGIN' },
        tests: guardar([{ variable: 'codigo', desde: 'data.codigoDesarrollo' }], 200),
      }),
      request({
        nombre: 'POST /auth/otp/verificar — login por código',
        descripcion: 'Segundo paso del login por OTP.',
        metodo: 'POST',
        ruta: 'api/auth/otp/verificar',
        body: { email: '{{email}}', codigo: '{{codigo}}', proposito: 'LOGIN' },
        tests: guardar([{ variable: 'token', desde: 'data.token' }], 200),
      }),
    ],
  },
  {
    name: '3 · Sesión',
    item: [
      request({
        nombre: 'GET /auth/me',
        descripcion:
          'Ruta privada. Usa el {{token}} guardado por los requests anteriores. ' +
          'Es la que la app llama al abrirse para saber si la sesión sigue viva.',
        metodo: 'GET',
        ruta: 'api/auth/me',
        auth: true,
        tests: guardar([], 200),
      }),
    ],
  },
  {
    name: '4 · Casos de error (para la demo)',
    item: [
      request({
        nombre: '400 — código OTP incorrecto',
        descripcion: 'Debe responder 400 con codigo OTP_INVALIDO.',
        metodo: 'POST',
        ruta: 'api/auth/otp/verificar',
        body: { email: '{{email}}', codigo: '000000', proposito: 'REGISTRO' },
        tests: guardar([], 400),
      }),
      request({
        nombre: '401 — contraseña incorrecta',
        descripcion: 'Debe responder 401 con codigo CREDENCIALES_INVALIDAS.',
        metodo: 'POST',
        ruta: 'api/auth/login',
        body: { email: '{{email}}', password: 'contrasenia-mal' },
        tests: guardar([], 401),
      }),
      request({
        nombre: '401 — /me sin token',
        descripcion: 'Debe responder 401 con codigo TOKEN_FALTANTE.',
        metodo: 'GET',
        ruta: 'api/auth/me',
        tests: guardar([], 401),
      }),
      request({
        nombre: '409 — email ya registrado',
        descripcion: 'Correlo después de verificar la cuenta: debe dar 409 EMAIL_EN_USO.',
        metodo: 'POST',
        ruta: 'api/auth/registro',
        body: { email: '{{email}}', password: '{{password}}', nombre: 'Lucas' },
        tests: guardar([], 409),
      }),
    ],
  },
].map((carpeta) => ({ ...carpeta, id: idEstable(carpeta.name) }));

const coleccion = {
  info: {
    _postman_id: idEstable('Ronda API - TPO'),
    name: 'Ronda API — TPO Punto 1',
    description:
      'Colección generada automáticamente por `npm run postman`.\n\n' +
      'No la edites a mano: los cambios se pisan. Si querés agregar un request, ' +
      'editá `scripts/generate-postman.js` y volvé a generar.\n\n' +
      '**Cómo usarla:** importá también el environment `Ronda-Local`, seleccionalo ' +
      'arriba a la derecha, y corré los requests en orden. El token y el código OTP ' +
      'se guardan solos.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: carpetas,
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
    { key: 'email', value: 'lucas.prueba@gmail.com', type: 'string' },
    { key: 'password', value: 'secreto123', type: 'string' },
    { key: 'token', value: '', type: 'string' },
    { key: 'codigo', value: '', type: 'string' },
  ],
};

const entorno = {
  id: idEstable('Ronda Local'),
  name: 'Ronda Local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'default', enabled: true },
    { key: 'email', value: 'lucas.prueba@gmail.com', type: 'default', enabled: true },
    { key: 'password', value: 'secreto123', type: 'default', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

fs.mkdirSync(SALIDA, { recursive: true });

const rutaColeccion = path.join(SALIDA, 'Ronda-API.postman_collection.json');
const rutaEntorno = path.join(SALIDA, 'Ronda-Local.postman_environment.json');

fs.writeFileSync(rutaColeccion, JSON.stringify(coleccion, null, 2) + '\n', 'utf8');
fs.writeFileSync(rutaEntorno, JSON.stringify(entorno, null, 2) + '\n', 'utf8');

const cantidad = carpetas.reduce((total, c) => total + c.item.length, 0);
console.log('');
console.log(`Colección de Postman generada (${cantidad} requests en ${carpetas.length} carpetas):`);
console.log(`  ${rutaColeccion}`);
console.log(`  ${rutaEntorno}`);
console.log('');
console.log('En Postman: Import -> arrastrá los dos archivos -> elegí el environment "Ronda Local".');
console.log('');

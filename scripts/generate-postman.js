// Genera la colección de Postman a partir de la definición de endpoints que
// está más abajo, para no mantener a mano un JSON de miles de líneas.
//
//   npm run postman
//
// Produce dos archivos en /postman:
//   Ronda-API.postman_collection.json    -> Import en Postman
//   Ronda-Local.postman_environment.json -> Import y seleccionar arriba a la derecha
//
// La colección guarda sola el token y los ids que va necesitando, así que se
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

/**
 * Arma el script de test: chequea el status y guarda en variables los datos
 * que van a necesitar los requests siguientes.
 */
function tests(estado, guardar = []) {
  return [
    `pm.test("Status ${estado}", function () {`,
    `    pm.expect(pm.response.code).to.eql(${estado});`,
    '});',
    '',
    'if (pm.response.code < 300) {',
    '    const data = pm.response.json();',
    ...guardar.map((g) => `    if (${g.desde}) pm.collectionVariables.set("${g.variable}", ${g.desde});`),
    '}',
  ];
}

function request({ nombre, descripcion, metodo, ruta, body, auth, estado = 200, guardar }) {
  const [rutaSinQuery, queryString] = ruta.split('?');

  const url = {
    raw: `{{baseUrl}}/${ruta}`,
    host: ['{{baseUrl}}'],
    path: rutaSinQuery.split('/'),
  };
  if (queryString) {
    url.query = queryString.split('&').map((par) => {
      const [key, value = ''] = par.split('=');
      return { key, value };
    });
  }

  const item = {
    name: nombre,
    id: idEstable(nombre + ruta + metodo),
    request: { method: metodo, header: [], url, description: descripcion },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: tests(estado, guardar) } }],
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
  return item;
}

// ---------------------------------------------------------------
// Definición de la colección, agrupada por punto de la consigna
// ---------------------------------------------------------------
const carpetas = [
  {
    name: '0 · Salud',
    item: [
      request({
        nombre: 'GET /health',
        descripcion: 'Chequea que la API esté levantada y conectada a la base.',
        metodo: 'GET',
        ruta: 'api/health',
      }),
    ],
  },
  {
    name: '1 · Autenticación',
    item: [
      request({
        nombre: 'POST /auth/registro',
        descripcion:
          'Crea la cuenta y envía el primer código OTP.\n\n' +
          'Guarda el código en {{codigo}} (necesita OTP_EXPOSE_IN_RESPONSE=true).',
        metodo: 'POST',
        ruta: 'api/auth/registro',
        body: { email: '{{email}}', password: '{{password}}', nombre: 'Lucas' },
        estado: 201,
        guardar: [{ variable: 'codigo', desde: 'data.codigoDesarrollo' }],
      }),
      request({
        nombre: 'POST /auth/otp/enviar — reenviar',
        descripcion: 'Reenvía el código. Dos veces seguidas responde 429 OTP_COOLDOWN.',
        metodo: 'POST',
        ruta: 'api/auth/otp/enviar',
        body: { email: '{{email}}', proposito: 'REGISTRO' },
        guardar: [{ variable: 'codigo', desde: 'data.codigoDesarrollo' }],
      }),
      request({
        nombre: 'POST /auth/otp/verificar — confirmar cuenta',
        descripcion: 'Valida el código, verifica el email y devuelve el token.',
        metodo: 'POST',
        ruta: 'api/auth/otp/verificar',
        body: { email: '{{email}}', codigo: '{{codigo}}', proposito: 'REGISTRO' },
        guardar: [
          { variable: 'token', desde: 'data.token' },
          { variable: 'usuarioId', desde: 'data.usuario.id' },
        ],
      }),
      request({
        nombre: 'POST /auth/login',
        descripcion: 'Login con email y contraseña.',
        metodo: 'POST',
        ruta: 'api/auth/login',
        body: { email: '{{email}}', password: '{{password}}' },
        guardar: [
          { variable: 'token', desde: 'data.token' },
          { variable: 'usuarioId', desde: 'data.usuario.id' },
        ],
      }),
      request({
        nombre: 'GET /auth/me',
        descripcion: 'Ruta privada. La app la usa al abrirse para saber si la sesión sigue viva.',
        metodo: 'GET',
        ruta: 'api/auth/me',
        auth: true,
      }),
    ],
  },
  {
    name: '2 · Perfil y reputación',
    item: [
      request({
        nombre: 'GET /zonas',
        descripcion: 'Catálogo de zonas. Público: la app lo necesita para el selector.',
        metodo: 'GET',
        ruta: 'api/zonas',
        guardar: [{ variable: 'zonaId', desde: 'data.zonas[0].id' }],
      }),
      request({
        nombre: 'GET /usuarios/me',
        descripcion: 'Mis datos personales.',
        metodo: 'GET',
        ruta: 'api/usuarios/me',
        auth: true,
      }),
      request({
        nombre: 'PUT /usuarios/me',
        descripcion:
          'Editar nombre, teléfono y zona. El email no se cambia acá: obligaría a ' +
          'verificarlo de nuevo con un OTP.',
        metodo: 'PUT',
        ruta: 'api/usuarios/me',
        body: { nombre: 'Lucas Rodríguez', telefono: '11 5555-1234', zonaId: '{{zonaId}}' },
        auth: true,
      }),
      request({
        nombre: 'GET /usuarios/:id/perfil',
        descripcion:
          'Perfil público: reputación, antigüedad y publicaciones activas. ' +
          'No expone email ni teléfono.',
        metodo: 'GET',
        ruta: 'api/usuarios/{{usuarioId}}/perfil',
      }),
      request({
        nombre: 'GET /usuarios/:id/reputacion',
        descripcion: 'Sólo la reputación: promedio de estrellas y operaciones de cada lado.',
        metodo: 'GET',
        ruta: 'api/usuarios/{{usuarioId}}/reputacion',
      }),
    ],
  },
  {
    name: '3 · Explorar publicaciones',
    item: [
      request({
        nombre: 'GET /categorias',
        descripcion: 'Catálogo de categorías para el filtro y para el alta.',
        metodo: 'GET',
        ruta: 'api/categorias',
        guardar: [{ variable: 'categoriaId', desde: 'data.categorias[0].id' }],
      }),
      request({
        nombre: 'GET /publicaciones — listado',
        descripcion: 'Listado paginado. Con token, cada ítem trae además esFavorito.',
        metodo: 'GET',
        ruta: 'api/publicaciones?pagina=1&limite=20',
        auth: true,
        guardar: [{ variable: 'publicacionId', desde: 'data.items[0] && data.items[0].id' }],
      }),
      request({
        nombre: 'GET /publicaciones — buscador',
        descripcion: 'Texto libre sobre título y descripción.',
        metodo: 'GET',
        ruta: 'api/publicaciones?q=notebook',
      }),
      request({
        nombre: 'GET /publicaciones — filtros combinados',
        descripcion:
          'Categoría + rango de precio + estado del artículo. estadoArticulo admite ' +
          'varios separados por coma.',
        metodo: 'GET',
        ruta: 'api/publicaciones?categoriaId={{categoriaId}}&precioMin=0&precioMax=500000&estadoArticulo=NUEVO,COMO_NUEVO',
      }),
      request({
        nombre: 'GET /publicaciones — ordenar',
        descripcion: 'orden: recientes | precio_asc | precio_desc | cercania.',
        metodo: 'GET',
        ruta: 'api/publicaciones?orden=precio_asc',
      }),
      request({
        nombre: 'GET /publicaciones — cercanía',
        descripcion:
          'Ordena por cercanía a la zona del usuario. Requiere sesión con zona ' +
          'configurada, si no responde 400 SIN_ZONA_CONFIGURADA.',
        metodo: 'GET',
        ruta: 'api/publicaciones?orden=cercania',
        auth: true,
      }),
    ],
  },
  {
    name: '4 · Detalle, preguntas y ofertas',
    item: [
      request({
        nombre: 'GET /publicaciones/:id — detalle',
        descripcion:
          'Galería, descripción, vendedor con reputación, y las acciones disponibles ' +
          'según quién mira.',
        metodo: 'GET',
        ruta: 'api/publicaciones/{{publicacionId}}',
        auth: true,
      }),
      request({
        nombre: 'GET /publicaciones/:id/preguntas',
        descripcion: 'Público.',
        metodo: 'GET',
        ruta: 'api/publicaciones/{{publicacionId}}/preguntas',
      }),
      request({
        nombre: 'POST /publicaciones/:id/preguntas',
        descripcion: 'En tu propia publicación responde 403 ES_TU_PUBLICACION.',
        metodo: 'POST',
        ruta: 'api/publicaciones/{{publicacionId}}/preguntas',
        body: { texto: '¿Aceptás transferencia?' },
        auth: true,
        estado: 201,
        guardar: [{ variable: 'preguntaId', desde: 'data.pregunta.id' }],
      }),
      request({
        nombre: 'POST /preguntas/:id/respuesta',
        descripcion: 'Sólo el vendedor de esa publicación.',
        metodo: 'POST',
        ruta: 'api/preguntas/{{preguntaId}}/respuesta',
        body: { respuesta: 'Sí, sin problema.' },
        auth: true,
      }),
      request({
        nombre: 'POST /publicaciones/:id/ofertas',
        descripcion:
          'Una oferta pendiente por persona: volver a ofertar actualiza el monto. ' +
          'No puede superar el precio publicado.',
        metodo: 'POST',
        ruta: 'api/publicaciones/{{publicacionId}}/ofertas',
        body: { monto: 1000 },
        auth: true,
        estado: 201,
        guardar: [{ variable: 'ofertaId', desde: 'data.oferta.id' }],
      }),
      request({
        nombre: 'GET /publicaciones/:id/ofertas',
        descripcion: 'El vendedor ve todas; un interesado ve sólo las suyas.',
        metodo: 'GET',
        ruta: 'api/publicaciones/{{publicacionId}}/ofertas',
        auth: true,
      }),
      request({
        nombre: 'PATCH /ofertas/:id',
        descripcion: 'Aceptar o rechazar. Sólo el vendedor.',
        metodo: 'PATCH',
        ruta: 'api/ofertas/{{ofertaId}}',
        body: { estado: 'ACEPTADA' },
        auth: true,
      }),
    ],
  },
  {
    name: '5 · Publicar',
    item: [
      request({
        nombre: 'PUT /publicaciones/borrador',
        descripcion: 'Se llama en cada paso del alta guiada. No valida: el borrador está incompleto.',
        metodo: 'PUT',
        ruta: 'api/publicaciones/borrador',
        body: { paso: 2, datos: { titulo: 'Mesa de comedor', precio: 250000 } },
        auth: true,
      }),
      request({
        nombre: 'GET /publicaciones/borrador',
        descripcion: 'Recupera la carga interrumpida. Si no hay, devuelve borrador: null.',
        metodo: 'GET',
        ruta: 'api/publicaciones/borrador',
        auth: true,
      }),
      request({
        nombre: 'POST /publicaciones — crear',
        descripcion: 'Publica el artículo y borra el borrador.',
        metodo: 'POST',
        ruta: 'api/publicaciones',
        body: {
          titulo: 'Mesa de comedor',
          descripcion: 'Madera maciza, 6 sillas. Muy buen estado.',
          categoriaId: '{{categoriaId}}',
          precio: 250000,
          estadoArticulo: 'USADO',
          zonaId: '{{zonaId}}',
          fotos: ['https://picsum.photos/seed/mesa1/800/600'],
        },
        auth: true,
        estado: 201,
        guardar: [{ variable: 'miPublicacionId', desde: 'data.publicacion.id' }],
      }),
      request({
        nombre: 'PUT /publicaciones/:id — editar',
        descripcion: 'No se puede editar una publicación vendida.',
        metodo: 'PUT',
        ruta: 'api/publicaciones/{{miPublicacionId}}',
        body: {
          titulo: 'Mesa de comedor de roble',
          descripcion: 'Madera maciza, 6 sillas. Muy buen estado.',
          categoriaId: '{{categoriaId}}',
          precio: 230000,
          estadoArticulo: 'USADO',
          zonaId: '{{zonaId}}',
          fotos: ['https://picsum.photos/seed/mesa1/800/600'],
        },
        auth: true,
      }),
      request({
        nombre: 'PATCH /publicaciones/:id/estado — pausar',
        descripcion: 'ACTIVA -> PAUSADA -> ACTIVA. Una vendida ya no vuelve.',
        metodo: 'PATCH',
        ruta: 'api/publicaciones/{{miPublicacionId}}/estado',
        body: { estado: 'PAUSADA' },
        auth: true,
      }),
      request({
        nombre: 'PATCH /publicaciones/:id/estado — reactivar',
        descripcion: 'Vuelve al Home.',
        metodo: 'PATCH',
        ruta: 'api/publicaciones/{{miPublicacionId}}/estado',
        body: { estado: 'ACTIVA' },
        auth: true,
      }),
      request({
        nombre: 'GET /publicaciones/mias',
        descripcion: 'Mis publicaciones con el resumen por estado. Filtro opcional ?estado=.',
        metodo: 'GET',
        ruta: 'api/publicaciones/mias',
        auth: true,
      }),
      request({
        nombre: 'DELETE /publicaciones/:id',
        descripcion: 'Elimina la publicación y, en cascada, sus fotos, preguntas y ofertas.',
        metodo: 'DELETE',
        ruta: 'api/publicaciones/{{miPublicacionId}}',
        auth: true,
      }),
    ],
  },
  {
    name: '6 · Favoritos y búsquedas guardadas',
    item: [
      request({
        nombre: 'POST /publicaciones/:id/favorito',
        descripcion: 'Guarda el precio del momento, para poder detectar el cambio después.',
        metodo: 'POST',
        ruta: 'api/publicaciones/{{publicacionId}}/favorito',
        auth: true,
        estado: 201,
      }),
      request({
        nombre: 'GET /favoritos',
        descripcion: 'Cada ítem trae novedad: cambioDePrecio, precioAnterior y bajoDePrecio.',
        metodo: 'GET',
        ruta: 'api/favoritos',
        auth: true,
      }),
      request({
        nombre: 'DELETE /publicaciones/:id/favorito',
        descripcion: 'Quitar de favoritos.',
        metodo: 'DELETE',
        ruta: 'api/publicaciones/{{publicacionId}}/favorito',
        auth: true,
      }),
      request({
        nombre: 'POST /busquedas-guardadas',
        descripcion: 'Guarda los filtros con un nombre. Sólo se guardan las claves conocidas.',
        metodo: 'POST',
        ruta: 'api/busquedas-guardadas',
        body: {
          nombre: 'Celulares baratos',
          filtros: { categoriaId: '{{categoriaId}}', precioMax: 400000, orden: 'precio_asc' },
        },
        auth: true,
        estado: 201,
        guardar: [{ variable: 'busquedaId', desde: 'data.busqueda.id' }],
      }),
      request({
        nombre: 'GET /busquedas-guardadas',
        descripcion: 'Con el contador de novedades de cada una y el total.',
        metodo: 'GET',
        ruta: 'api/busquedas-guardadas',
        auth: true,
      }),
      request({
        nombre: 'GET /busquedas-guardadas/:id/resultados',
        descripcion: 'Corre la búsqueda y marca que ya la viste: apaga el indicador.',
        metodo: 'GET',
        ruta: 'api/busquedas-guardadas/{{busquedaId}}/resultados',
        auth: true,
      }),
      request({
        nombre: 'DELETE /busquedas-guardadas/:id',
        descripcion: 'Borrar la búsqueda guardada.',
        metodo: 'DELETE',
        ruta: 'api/busquedas-guardadas/{{busquedaId}}',
        auth: true,
      }),
    ],
  },
  {
    name: '7 · Casos de error (para la demo)',
    item: [
      request({
        nombre: '400 — código OTP incorrecto',
        descripcion: 'codigo OTP_INVALIDO u OTP_INEXISTENTE.',
        metodo: 'POST',
        ruta: 'api/auth/otp/verificar',
        body: { email: '{{email}}', codigo: '000000', proposito: 'REGISTRO' },
        estado: 400,
      }),
      request({
        nombre: '400 — nombre con números',
        descripcion: 'codigo NOMBRE_CON_NUMEROS.',
        metodo: 'POST',
        ruta: 'api/auth/registro',
        body: { email: 'otro@mail.com', password: 'secreto123', nombre: 'Lucas 3110' },
        estado: 400,
      }),
      request({
        nombre: '401 — contraseña incorrecta',
        descripcion: 'codigo CREDENCIALES_INVALIDAS.',
        metodo: 'POST',
        ruta: 'api/auth/login',
        body: { email: '{{email}}', password: 'contrasenia-mal' },
        estado: 401,
      }),
      request({
        nombre: '401 — ruta privada sin token',
        descripcion: 'codigo TOKEN_FALTANTE.',
        metodo: 'GET',
        ruta: 'api/usuarios/me',
        estado: 401,
      }),
      request({
        nombre: '403 — editar publicación ajena',
        descripcion: 'codigo NO_SOS_EL_VENDEDOR.',
        metodo: 'PATCH',
        ruta: 'api/publicaciones/{{publicacionId}}/estado',
        body: { estado: 'PAUSADA' },
        auth: true,
        estado: 403,
      }),
      request({
        nombre: '404 — publicación inexistente',
        descripcion: 'codigo PUBLICACION_NO_ENCONTRADA.',
        metodo: 'GET',
        ruta: 'api/publicaciones/999999',
        estado: 404,
      }),
      request({
        nombre: '409 — email ya registrado',
        descripcion: 'codigo EMAIL_EN_USO. Correlo después de verificar la cuenta.',
        metodo: 'POST',
        ruta: 'api/auth/registro',
        body: { email: '{{email}}', password: '{{password}}', nombre: 'Lucas' },
        estado: 409,
      }),
      request({
        nombre: '400 — rango de precio invertido',
        descripcion: 'codigo RANGO_PRECIO_INVALIDO.',
        metodo: 'GET',
        ruta: 'api/publicaciones?precioMin=500000&precioMax=1000',
        estado: 400,
      }),
    ],
  },
].map((carpeta) => ({ ...carpeta, id: idEstable(carpeta.name) }));

const coleccion = {
  info: {
    _postman_id: idEstable('Ronda API - TPO'),
    name: 'Ronda API — TPO',
    description:
      'Colección generada automáticamente por `npm run postman`.\n\n' +
      'No la edites a mano: los cambios se pisan. Si querés agregar un request, ' +
      'editá `scripts/generate-postman.js` y volvé a generar.\n\n' +
      '**Cómo usarla:** importá también el environment `Ronda Local`, seleccionalo ' +
      'arriba a la derecha, y corré las carpetas en orden. El token y los ids se ' +
      'guardan solos entre requests.\n\n' +
      'Para tener datos con qué probar: `npm run db:seed`.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: carpetas,
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
    { key: 'email', value: 'lucas.prueba@gmail.com', type: 'string' },
    { key: 'password', value: 'secreto123', type: 'string' },
    { key: 'token', value: '', type: 'string' },
    { key: 'codigo', value: '', type: 'string' },
    { key: 'usuarioId', value: '', type: 'string' },
    { key: 'zonaId', value: '', type: 'string' },
    { key: 'categoriaId', value: '', type: 'string' },
    { key: 'publicacionId', value: '', type: 'string' },
    { key: 'miPublicacionId', value: '', type: 'string' },
    { key: 'preguntaId', value: '', type: 'string' },
    { key: 'ofertaId', value: '', type: 'string' },
    { key: 'busquedaId', value: '', type: 'string' },
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

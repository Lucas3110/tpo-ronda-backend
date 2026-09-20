// Regresión de la API: recorre los 10 puntos de la consigna contra un
// servidor corriendo y avisa si algo dejó de funcionar.
//
//   npm run dev        (en otra terminal)
//   npm run db:seed
//   npm run test:api
//
// Contra otro puerto:  API_URL=http://localhost:3001/api npm run test:api
//
// No reemplaza a las pruebas manuales desde la app, pero atrapa en 20
// segundos lo que de otra forma se descubre en plena demo.
const BASE = process.env.API_URL || 'http://localhost:3000/api';
const PASSWORD_DEMO = 'demo1234';

let ok = 0;
let fallo = 0;
const fallos = [];

function chequear(nombre, condicion, detalle = '') {
  if (condicion) {
    ok++;
    console.log(`  OK    ${nombre}${detalle ? '  ' + detalle : ''}`);
  } else {
    fallo++;
    fallos.push(nombre);
    console.log(`  FALLA ${nombre}${detalle ? '  ' + detalle : ''}`);
  }
}

function seccion(titulo) {
  console.log('');
  console.log(`== ${titulo} ==`);
}

async function pedir(metodo, ruta, { bearer, body } = {}) {
  const cabeceras = { 'Content-Type': 'application/json' };
  if (bearer) cabeceras.Authorization = bearer;

  const respuesta = await fetch(BASE + ruta, {
    method: metodo,
    headers: cabeceras,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: respuesta.status,
    body: await respuesta.json().catch(() => null),
  };
}

async function ingresar(email) {
  const r = await pedir('POST', '/auth/login', { body: { email, password: PASSWORD_DEMO } });
  if (!r.body || !r.body.token) {
    throw new Error(
      `No pude ingresar con ${email}. ¿Corriste "npm run db:seed"?\n` +
        JSON.stringify(r.body)
    );
  }
  return { bearer: `Bearer ${r.body.token}`, id: r.body.usuario.id, nombre: r.body.usuario.nombre };
}

async function main() {
  console.log('');
  console.log(`Regresión contra ${BASE}`);

  const salud = await pedir('GET', '/health');
  if (salud.status !== 200) {
    console.error(`\nLa API no responde en ${BASE}. Levantala con "npm run dev".\n`);
    process.exit(1);
  }

  const sofia = await ingresar('sofia.demo@ronda.app');
  const martin = await ingresar('martin.demo@ronda.app');
  const carla = await ingresar('carla.demo@ronda.app');

  // -------------------------------------------------------------
  seccion('Punto 1 · Autenticación');
  let r = await pedir('GET', '/auth/me', { bearer: sofia.bearer });
  chequear('perfil de la sesión', r.status === 200 && r.body.usuario.email === 'sofia.demo@ronda.app');

  r = await pedir('GET', '/auth/me');
  chequear('sin token responde 401', r.status === 401, '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/auth/me', { bearer: 'Bearer token.falso.aca' });
  chequear('token inválido responde 401', r.status === 401, '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/auth/login', {
    body: { email: 'sofia.demo@ronda.app', password: 'incorrecta' },
  });
  chequear('contraseña incorrecta', r.status === 401, '| ' + r.body?.error?.codigo);

  const nuevoEmail = `regresion.${Date.now()}@ronda.test`;
  r = await pedir('POST', '/auth/registro', {
    body: { email: nuevoEmail, password: PASSWORD_DEMO, nombre: 'Prueba Regresion' },
  });
  chequear('registro de una cuenta nueva', r.status === 201, '| ' + r.status);

  r = await pedir('POST', '/auth/registro', {
    body: { email: 'sofia.demo@ronda.app', password: PASSWORD_DEMO, nombre: 'Otra' },
  });
  chequear('email ya registrado', r.status === 409, '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/auth/registro', {
    body: { email: `x.${Date.now()}@ronda.test`, password: PASSWORD_DEMO, nombre: 'Juan 123' },
  });
  chequear('nombre con números rechazado', r.status === 400, '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/auth/otp/enviar', { body: { email: nuevoEmail, proposito: 'LOGIN' } });
  chequear('envío de OTP', r.status === 200 || r.status === 429, '| ' + r.status);

  // -------------------------------------------------------------
  seccion('Punto 2 · Perfil y reputación');
  r = await pedir('GET', '/usuarios/me', { bearer: sofia.bearer });
  chequear('datos propios', r.status === 200 && r.body.usuario.email !== undefined);
  chequear('expone fotoUrl', 'fotoUrl' in r.body.usuario);
  const perfilSofia = r.body.usuario;

  r = await pedir('PUT', '/usuarios/me', {
    bearer: sofia.bearer,
    body: {
      nombre: perfilSofia.nombre,
      telefono: perfilSofia.telefono,
      zonaId: perfilSofia.zona?.id,
      fotoUrl: 'https://example.com/foto.jpg',
    },
  });
  chequear('editar perfil con foto', r.status === 200 && r.body.usuario.fotoUrl === 'https://example.com/foto.jpg');

  r = await pedir('PUT', '/usuarios/me', {
    bearer: sofia.bearer,
    body: { nombre: perfilSofia.nombre, telefono: perfilSofia.telefono, zonaId: perfilSofia.zona?.id, fotoUrl: 'javascript:alert(1)' },
  });
  chequear('foto con esquema raro rechazada', r.status === 400, '| ' + r.body?.error?.codigo);

  r = await pedir('GET', `/usuarios/${sofia.id}/perfil`);
  chequear('perfil público sin sesión', r.status === 200);
  chequear('no filtra el email', r.body.perfil?.email === undefined);
  chequear('trae antigüedad', typeof r.body.perfil?.antiguedadDias === 'number');
  chequear('trae publicaciones activas', Array.isArray(r.body.perfil?.publicacionesActivas));

  r = await pedir('GET', `/usuarios/${sofia.id}/reputacion`);
  chequear('reputación calculada', r.status === 200 && r.body.reputacion.cantidadCalificaciones > 0,
    '| ' + r.body.reputacion?.promedioEstrellas + ' estrellas');

  r = await pedir('GET', '/zonas');
  chequear('catálogo de zonas', r.status === 200 && r.body.zonas.length > 0, '| ' + r.body.zonas?.length);

  // -------------------------------------------------------------
  seccion('Punto 3 · Home');
  r = await pedir('GET', '/publicaciones');
  chequear('listado público', r.status === 200 && Array.isArray(r.body.items));
  chequear('trae el paginado', typeof r.body.hayMas === 'boolean');

  r = await pedir('GET', '/publicaciones?limite=3&pagina=1');
  chequear('respeta el límite', r.body.items.length <= 3, '| ' + r.body.items.length);

  // El término sale de una publicación activa de verdad y no de una palabra
  // fija: el seed marca algunas como vendidas, y una constante acá haría que
  // la prueba fallara por los datos y no por el buscador.
  const activas = await pedir('GET', '/publicaciones?limite=1');
  const palabra = activas.body.items[0].titulo.split(' ')[0];
  r = await pedir('GET', `/publicaciones?q=${encodeURIComponent(palabra)}`);
  chequear('buscador por texto', r.status === 200 && r.body.items.length > 0,
    `| "${palabra}" -> ${r.body.items.length}`);

  r = await pedir('GET', '/publicaciones?precioMin=100000&precioMax=300000');
  const enRango = r.body.items.every((p) => p.precio >= 100000 && p.precio <= 300000);
  chequear('filtro por rango de precio', enRango, '| ' + r.body.items.length + ' resultados');

  r = await pedir('GET', '/publicaciones?estadoArticulo=NUEVO,COMO_NUEVO');
  chequear('filtro por estado del artículo',
    r.body.items.every((p) => ['NUEVO', 'COMO_NUEVO'].includes(p.estadoArticulo)));

  r = await pedir('GET', '/publicaciones?orden=precio_asc&limite=50');
  const precios = r.body.items.map((p) => p.precio);
  chequear('orden por menor precio', precios.every((v, i) => i === 0 || precios[i - 1] <= v));

  r = await pedir('GET', '/publicaciones?orden=precio_desc&limite=50');
  const desc = r.body.items.map((p) => p.precio);
  chequear('orden por mayor precio', desc.every((v, i) => i === 0 || desc[i - 1] >= v));

  r = await pedir('GET', '/publicaciones?orden=cercania', { bearer: sofia.bearer });
  chequear('orden por cercanía', r.status === 200);

  r = await pedir('GET', '/publicaciones?orden=; DROP TABLE usuarios--');
  chequear('orden inválido no se interpola', r.status === 400, '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/categorias');
  chequear('catálogo de categorías', r.status === 200 && r.body.categorias.length > 0);

  // -------------------------------------------------------------
  seccion('Punto 4 · Detalle, preguntas y ofertas');
  const listado = await pedir('GET', '/publicaciones?limite=50');
  let publicacion = null;
  for (const item of listado.body.items) {
    const d = await pedir('GET', `/publicaciones/${item.id}`, { bearer: sofia.bearer });
    if (d.body.publicacion.esMia && d.body.publicacion.estado === 'ACTIVA') {
      publicacion = d.body.publicacion;
      break;
    }
  }
  chequear('hay una publicación activa de prueba', publicacion !== null);

  r = await pedir('GET', `/publicaciones/${publicacion.id}`);
  chequear('detalle público', r.status === 200);
  chequear('trae la galería', Array.isArray(r.body.publicacion.fotos));
  chequear('trae el vendedor con reputación', r.body.publicacion.vendedor?.reputacion !== undefined);
  chequear('sin sesión requiereSesion = true', r.body.publicacion.acciones.requiereSesion === true);

  r = await pedir('GET', `/publicaciones/${publicacion.id}`, { bearer: sofia.bearer });
  chequear('el vendedor puede gestionar', r.body.publicacion.acciones.puedeGestionar === true);
  chequear('y no ofertarse a sí mismo', r.body.publicacion.acciones.puedeOfertar === false);

  r = await pedir('GET', `/publicaciones/${publicacion.id}`, { bearer: martin.bearer });
  chequear('el interesado puede preguntar y ofertar',
    r.body.publicacion.acciones.puedePreguntar && r.body.publicacion.acciones.puedeOfertar);

  r = await pedir('POST', `/publicaciones/${publicacion.id}/preguntas`, {
    bearer: martin.bearer, body: { texto: '¿Lo entregás en mano?' },
  });
  chequear('preguntar', r.status === 201);
  const preguntaId = r.body.pregunta?.id;

  r = await pedir('POST', `/publicaciones/${publicacion.id}/preguntas`, {
    bearer: sofia.bearer, body: { texto: 'Me pregunto a mí misma' },
  });
  chequear('no se pregunta en la propia', r.status === 403, '| ' + r.body?.error?.codigo);

  r = await pedir('POST', `/preguntas/${preguntaId}/respuesta`, {
    bearer: sofia.bearer, body: { respuesta: 'Sí, coordinamos' },
  });
  chequear('el vendedor responde', r.status === 200);

  r = await pedir('POST', `/preguntas/${preguntaId}/respuesta`, {
    bearer: martin.bearer, body: { respuesta: 'Contesto yo' },
  });
  chequear('un tercero no responde', r.status === 403, '| ' + r.body?.error?.codigo);

  r = await pedir('GET', `/publicaciones/${publicacion.id}/preguntas`);
  chequear('las preguntas son públicas', r.status === 200 && r.body.preguntas.length > 0);

  // Dirección oculta hasta la oferta aceptada
  r = await pedir('GET', `/publicaciones/${publicacion.id}`, { bearer: martin.bearer });
  chequear('la dirección está oculta sin oferta aceptada',
    r.body.publicacion.entregaVisible === false && r.body.publicacion.entrega === null);

  r = await pedir('GET', `/publicaciones/${publicacion.id}`, { bearer: sofia.bearer });
  chequear('el vendedor sí ve su dirección', r.body.publicacion.entregaVisible === true);

  // -------------------------------------------------------------
  seccion('Punto 5 · Publicar');
  const alta = {
    titulo: 'Escritorio regresión',
    descripcion: 'Publicación creada por la regresión automática.',
    precio: 50000,
    estadoArticulo: 'USADO',
    categoriaId: 1,
    zonaId: 6,
    fotos: ['https://picsum.photos/seed/regresion/800/600'],
    direccion: 'Av. Santa Fe 3253',
    latitud: -34.5881,
    longitud: -58.4106,
  };
  r = await pedir('POST', '/publicaciones', { bearer: carla.bearer, body: alta });
  chequear('crear con dirección y coordenadas', r.status === 201, '| ' + r.status);
  const creada = r.body.publicacion;
  chequear('guarda la url del mapa', typeof creada?.entrega?.urlMapa === 'string');

  r = await pedir('POST', '/publicaciones', { bearer: carla.bearer, body: { ...alta, latitud: -34.5, longitud: undefined } });
  chequear('coordenadas a medias rechazadas', r.status === 400, '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/publicaciones', { bearer: carla.bearer, body: { ...alta, precio: -1 } });
  chequear('precio negativo rechazado', r.status === 400, '| ' + r.body?.error?.codigo);

  r = await pedir('PUT', `/publicaciones/${creada.id}`, {
    bearer: carla.bearer, body: { ...alta, precio: 47000 },
  });
  chequear('editar', r.status === 200 && r.body.publicacion.precio === 47000);

  r = await pedir('PUT', `/publicaciones/${creada.id}`, { bearer: martin.bearer, body: alta });
  chequear('no se edita lo ajeno', r.status === 403, '| ' + r.body?.error?.codigo);

  r = await pedir('PATCH', `/publicaciones/${creada.id}/estado`, {
    bearer: carla.bearer, body: { estado: 'PAUSADA' },
  });
  chequear('pausar', r.status === 200);

  r = await pedir('GET', '/publicaciones/mias', { bearer: carla.bearer });
  chequear('mis publicaciones', r.status === 200 && r.body.items.length > 0);

  r = await pedir('PUT', '/publicaciones/borrador', {
    bearer: carla.bearer, body: { paso: 2, datos: { titulo: 'a medio cargar' } },
  });
  chequear('guardar borrador', r.status === 200);

  r = await pedir('GET', '/publicaciones/borrador', { bearer: carla.bearer });
  chequear('recuperar borrador', r.status === 200 && r.body.borrador?.paso === 2);

  r = await pedir('DELETE', '/publicaciones/borrador', { bearer: carla.bearer });
  chequear('descartar borrador', r.status === 200);

  r = await pedir('DELETE', `/publicaciones/${creada.id}`, { bearer: carla.bearer });
  chequear('eliminar', r.status === 200);

  // -------------------------------------------------------------
  seccion('Punto 7 · Negociación');
  r = await pedir('POST', `/publicaciones/${publicacion.id}/ofertas`, {
    bearer: martin.bearer,
    body: { monto: publicacion.precio - 10000, mensaje: 'Paso a buscarlo hoy' },
  });
  chequear('ofertar con mensaje', r.status === 201);
  const oferta = r.body.oferta;
  chequear('guarda el mensaje', oferta.mensaje === 'Paso a buscarlo hoy');
  chequear('nace con vencimiento', oferta.expiraEn !== null);
  chequear('origen COMPRADOR', oferta.origen === 'COMPRADOR');

  r = await pedir('POST', `/publicaciones/${publicacion.id}/ofertas`, {
    bearer: martin.bearer, body: { monto: publicacion.precio + 1 },
  });
  chequear('no supera el precio', r.status === 400, '| ' + r.body?.error?.codigo);

  r = await pedir('POST', `/ofertas/${oferta.id}/contraoferta`, {
    bearer: sofia.bearer, body: { monto: publicacion.precio - 2000, mensaje: 'Te lo dejo en esto' },
  });
  chequear('contraoferta del vendedor', r.status === 201, '| ' + r.status);
  const contra = r.body.oferta;
  chequear('origen VENDEDOR', contra.origen === 'VENDEDOR');
  chequear('encadenada a la original', contra.contraofertaDeId === oferta.id);

  r = await pedir('POST', `/ofertas/${oferta.id}/contraoferta`, {
    bearer: martin.bearer, body: { monto: 1000 },
  });
  chequear('sólo el vendedor contraoferta', r.status === 403 || r.status === 409, '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/ofertas/mias', { bearer: martin.bearer });
  chequear('mis ofertas: enviadas y recibidas',
    Array.isArray(r.body.enviadas) && Array.isArray(r.body.recibidas));
  const recibida = r.body.recibidas.find((o) => o.id === contra.id);
  chequear('la contraoferta llega como recibida', recibida !== undefined);
  chequear('con el contexto de la publicación', typeof recibida?.publicacion?.titulo === 'string');
  chequear('y sabe que espera respuesta', recibida?.esperaMiRespuesta === true);

  r = await pedir('GET', '/ofertas/mias?tipo=ENVIADAS', { bearer: sofia.bearer });
  chequear('filtro tipo=ENVIADAS', r.status === 200 && r.body.recibidas === undefined);

  r = await pedir('PATCH', `/ofertas/${contra.id}`, { bearer: martin.bearer, body: { estado: 'ACEPTADA' } });
  chequear('el comprador acepta la contraoferta', r.status === 200, '| ' + r.status);

  r = await pedir('PATCH', `/ofertas/${contra.id}`, { bearer: martin.bearer, body: { estado: 'RECHAZADA' } });
  chequear('no se responde dos veces', r.status === 409, '| ' + r.body?.error?.codigo);

  // -------------------------------------------------------------
  seccion('Punto 8 · Entrega y mapa');
  r = await pedir('GET', `/publicaciones/${publicacion.id}`, { bearer: martin.bearer });
  chequear('con la oferta aceptada ve la dirección', r.body.publicacion.entregaVisible === true);
  chequear('trae la dirección', typeof r.body.publicacion.entrega?.direccion === 'string',
    '| ' + r.body.publicacion.entrega?.direccion);
  chequear('trae las coordenadas', typeof r.body.publicacion.entrega?.latitud === 'number');
  chequear('trae la url de Google Maps',
    String(r.body.publicacion.entrega?.urlMapa).startsWith('https://www.google.com/maps/dir/'));

  r = await pedir('GET', `/publicaciones/${publicacion.id}`, { bearer: carla.bearer });
  chequear('un tercero sigue sin verla', r.body.publicacion.entregaVisible === false);

  chequear('la publicación quedó VENDIDA', r.body.publicacion.estado === 'VENDIDA');

  // -------------------------------------------------------------
  seccion('Punto 9 · Historial y calificaciones');
  r = await pedir('GET', '/operaciones', { bearer: sofia.bearer });
  chequear('historial con compras y ventas', Array.isArray(r.body.compras) && Array.isArray(r.body.ventas));
  chequear('la venta recién cerrada figura', r.body.ventas.length >= 1, '| ' + r.body.ventas.length);
  const venta = r.body.ventas[0];
  chequear('trae artículo, monto y contraparte',
    venta.articulo?.titulo !== undefined && typeof venta.montoFinal === 'number' && venta.contraparte?.nombre);

  r = await pedir('GET', '/operaciones?tipo=VENTA', { bearer: sofia.bearer });
  chequear('filtro por tipo', r.status === 200 && r.body.compras === undefined);

  r = await pedir('GET', '/operaciones?desde=2020-01-01&hasta=2020-12-31', { bearer: sofia.bearer });
  chequear('filtro por fechas deja fuera lo de hoy', r.body.ventas.length === 0);

  r = await pedir('GET', '/operaciones?desde=no-es-fecha', { bearer: sofia.bearer });
  chequear('fecha mal formada', r.status === 400, '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/operaciones/pendientes-calificar', { bearer: martin.bearer });
  chequear('pendientes de calificar', r.status === 200 && typeof r.body.total === 'number',
    '| ' + r.body.total);
  const pendiente = r.body.operaciones[0];

  if (pendiente) {
// El rango se prueba antes de calificar de verdad: despues, el 409 de
    // "ya calificada" taparia el 400 y el check pasaria por el motivo equivocado.
    for (const invalidas of [9, 0, 2.5]) {
      r = await pedir('POST', `/operaciones/${pendiente.id}/calificacion`, {
        bearer: martin.bearer, body: { estrellas: invalidas },
      });
      chequear(`estrellas ${invalidas} fuera de 1..5`,
        r.status === 400 && r.body?.error?.codigo === 'ESTRELLAS_INVALIDAS',
        '| ' + r.body?.error?.codigo);
    }

        r = await pedir('POST', `/operaciones/${pendiente.id}/calificacion`, {
      bearer: martin.bearer, body: { estrellas: 5, comentario: 'Todo diez' },
    });
    chequear('calificar', r.status === 201, '| ' + r.status);
    chequear('el rol lo deduce el backend', r.body.calificacion?.rolCalificado === 'VENDEDOR');

    r = await pedir('POST', `/operaciones/${pendiente.id}/calificacion`, {
      bearer: martin.bearer, body: { estrellas: 3 },
    });
    chequear('no se califica dos veces', r.status === 409, '| ' + r.body?.error?.codigo);

    r = await pedir('POST', `/operaciones/${pendiente.id}/calificacion`, {
      bearer: carla.bearer, body: { estrellas: 3 },
    });
    chequear('un tercero no califica', r.status === 403, '| ' + r.body?.error?.codigo);
  }


  r = await pedir('GET', `/usuarios/${sofia.id}/calificaciones`);
  chequear('calificaciones públicas', r.status === 200 && Array.isArray(r.body.calificaciones),
    '| ' + r.body.calificaciones?.length);

  // -------------------------------------------------------------
  seccion('Punto 10 · Favoritos y búsquedas guardadas');
  const otra = listado.body.items.find((p) => p.id !== publicacion.id);

  r = await pedir('POST', `/publicaciones/${otra.id}/favorito`, { bearer: martin.bearer });
  chequear('marcar favorito', r.status === 201 || r.status === 200, '| ' + r.status);

  r = await pedir('GET', '/favoritos', { bearer: martin.bearer });
  chequear('listar favoritos', r.status === 200 && r.body.items.length > 0);
  chequear('trae el indicador de novedad', r.body.items[0].novedad !== undefined);

  r = await pedir('GET', `/publicaciones/${otra.id}`, { bearer: martin.bearer });
  chequear('el detalle sabe que es favorito', r.body.publicacion.esFavorito === true);

  r = await pedir('DELETE', `/publicaciones/${otra.id}/favorito`, { bearer: martin.bearer });
  chequear('quitar favorito', r.status === 200);

  r = await pedir('POST', '/busquedas-guardadas', {
    bearer: martin.bearer,
    body: { nombre: 'Notebooks baratas', filtros: { q: 'notebook', precioMax: 600000 } },
  });
  chequear('guardar búsqueda', r.status === 201, '| ' + r.status);
  const busquedaId = r.body.busqueda?.id;

  r = await pedir('GET', '/busquedas-guardadas', { bearer: martin.bearer });
  chequear('listar búsquedas', r.status === 200 && r.body.busquedas.length > 0);

  r = await pedir('GET', `/busquedas-guardadas/${busquedaId}/resultados`, { bearer: martin.bearer });
  chequear('resultados de una búsqueda guardada', r.status === 200);

  r = await pedir('DELETE', `/busquedas-guardadas/${busquedaId}`, { bearer: martin.bearer });
  chequear('borrar búsqueda', r.status === 200);

  // -------------------------------------------------------------
  console.log('');
  if (fallo === 0) {
    console.log(`=== ${ok} checks OK ===`);
  } else {
    console.log(`=== ${ok} OK / ${fallo} FALLAN ===`);
    for (const f of fallos) console.log(`    - ${f}`);
  }
  console.log('');
  process.exit(fallo === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('');
  console.error('La regresión se cortó:', error.message);
  console.error('');
  process.exit(1);
});

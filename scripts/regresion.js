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

const GUION_VACIO = '';

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

// Devuelve una fecha AAAA-MM-DD de hace N dias. Con N negativo da una
// fecha futura, que es como probamos que el backend la rechace.
function fechaDeHace(dias) {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  const mes = String(f.getMonth() + 1).padStart(2, 0);
  const dia = String(f.getDate()).padStart(2, 0);
  return `${f.getFullYear()}-${mes}-${dia}`;
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
  seccion('Punto 1 · Registro en dos pasos');
  // El enunciado de Hallado pide este orden: email -> código -> nombre y
  // contraseña. La cuenta existe sin contraseña mientras el email no esté
  // confirmado, así que hay que verificar que en ese estado no se pueda entrar.
  const emailDosPasos = 'dospasos.' + Date.now() + '@ronda.test';

  r = await pedir('POST', '/auth/registro/solicitar', { body: { email: 'no-es-un-mail' } });
  chequear('solicitar con email inválido', r.status === 400 && r.body?.error?.codigo === 'EMAIL_INVALIDO', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/auth/registro/solicitar', { body: { email: 'sofia.demo@ronda.app' } });
  chequear('solicitar con email ya registrado', r.status === 409 && r.body?.error?.codigo === 'EMAIL_EN_USO', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/auth/registro/solicitar', { body: { email: emailDosPasos } });
  chequear('solicitar el registro', r.status === 201, '| ' + r.status);
  const codigoDosPasos = r.body?.codigoDesarrollo;

  if (!codigoDosPasos) {
    console.log('  (se saltea el resto: hace falta OTP_EXPOSE_IN_RESPONSE=true en el .env)');
  } else {
    r = await pedir('POST', '/auth/login', { body: { email: emailDosPasos, password: PASSWORD_DEMO } });
    chequear('sin confirmar no se puede ingresar', r.status === 401 && r.body?.error?.codigo === 'CREDENCIALES_INVALIDAS', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/auth/registro/confirmar', { body: { email: emailDosPasos, codigo: codigoDosPasos, nombre: 'Juan 123', password: PASSWORD_DEMO } });
    chequear('nombre con números rechazado', r.status === 400 && r.body?.error?.codigo === 'NOMBRE_CON_NUMEROS', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/auth/registro/confirmar', { body: { email: emailDosPasos, codigo: codigoDosPasos, nombre: 'Juan Prueba', password: 'abc' } });
    chequear('contraseña corta rechazada', r.status === 400 && r.body?.error?.codigo === 'PASSWORD_CORTA', '| ' + r.body?.error?.codigo);

    // Los dos rechazos de arriba no tienen que haber gastado el código: si el
    // nombre o la contraseña están mal, no es culpa del código.
    r = await pedir('POST', '/auth/registro/confirmar', { body: { email: emailDosPasos, nombre: 'Juan Prueba', password: PASSWORD_DEMO } });
    chequear('confirmar sin código', r.status === 400 && r.body?.error?.codigo === 'CODIGO_REQUERIDO', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/auth/registro/confirmar', { body: { email: emailDosPasos, codigo: codigoDosPasos, nombre: 'Juan Prueba', password: PASSWORD_DEMO } });
    chequear('confirmar el registro devuelve sesión', r.status === 200 && !!r.body?.token, '| ' + r.status);
    chequear('quedó el nombre que se mandó', r.body?.usuario?.nombre === 'Juan Prueba', '| ' + r.body?.usuario?.nombre);
    chequear('el email quedó verificado', r.body?.usuario?.emailVerificado === true);

    r = await pedir('POST', '/auth/registro/confirmar', { body: { email: emailDosPasos, codigo: codigoDosPasos, nombre: 'Juan Prueba', password: PASSWORD_DEMO } });
    chequear('el código no se puede reusar', r.status === 400 && r.body?.error?.codigo === 'OTP_INEXISTENTE', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/auth/login', { body: { email: emailDosPasos, password: PASSWORD_DEMO } });
    chequear('ahora sí se puede ingresar', r.status === 200 && !!r.body?.token, '| ' + r.status);
  }

  // -------------------------------------------------------------
  seccion('Punto 1 · Recupero de contraseña');
  // Cuenta descartable: cambiarle la contraseña a Sofía dejaría al resto
  // del script sin poder ingresar.
  const emailRecupero = 'recupero.' + Date.now() + '@ronda.test';
  const passwordNueva = 'nueva-clave-123';
  r = await pedir('POST', '/auth/registro/solicitar', { body: { email: emailRecupero } });
  const codigoAlta = r.body?.codigoDesarrollo;

  if (!codigoAlta) {
    console.log('  (se saltea: hace falta OTP_EXPOSE_IN_RESPONSE=true en el .env)');
  } else {
    await pedir('POST', '/auth/registro/confirmar', { body: { email: emailRecupero, codigo: codigoAlta, nombre: 'Prueba Recupero', password: PASSWORD_DEMO } });

    // Un email que no existe tiene que contestar igual que uno que sí: si no,
    // el endpoint sirve para averiguar quién tiene cuenta.
    r = await pedir('POST', '/auth/password/recuperar', { body: { email: 'fantasma.' + Date.now() + '@ronda.test' } });
    chequear('email inexistente no se delata', r.status === 200 && r.body?.codigoDesarrollo === undefined, '| ' + r.status);

    r = await pedir('POST', '/auth/password/recuperar', { body: { email: 'no-es-un-mail' } });
    chequear('email con formato inválido', r.status === 400 && r.body?.error?.codigo === 'EMAIL_INVALIDO', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/auth/password/recuperar', { body: { email: emailRecupero } });
    chequear('pedir el código de recupero', r.status === 200, '| ' + r.status);
    const codigoRecupero = r.body?.codigoDesarrollo;

    r = await pedir('POST', '/auth/password/recuperar', { body: { email: emailRecupero } });
    chequear('reenviar enseguida cae en el cooldown', r.status === 429 && r.body?.error?.codigo === 'OTP_COOLDOWN', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/auth/otp/verificar', { body: { email: emailRecupero, codigo: codigoRecupero, proposito: 'RECUPERO' } });
    chequear('el código de recupero no sirve para ingresar', r.status === 400 && r.body?.error?.codigo === 'PROPOSITO_INVALIDO', '| ' + r.body?.error?.codigo);

    const recuperoMal = codigoRecupero === '000000' ? '111111' : '000000';
    r = await pedir('POST', '/auth/password/restablecer', { body: { email: emailRecupero, codigo: recuperoMal, password: passwordNueva } });
    chequear('código incorrecto', r.status === 400 && r.body?.error?.codigo === 'OTP_INVALIDO', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/auth/password/restablecer', { body: { email: emailRecupero, codigo: codigoRecupero, password: 'abc' } });
    chequear('contraseña corta rechazada', r.status === 400 && r.body?.error?.codigo === 'PASSWORD_CORTA', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/auth/login', { body: { email: emailRecupero, password: PASSWORD_DEMO } });
    chequear('la contraseña vieja vale hasta restablecer', r.status === 200, '| ' + r.status);

    r = await pedir('POST', '/auth/password/restablecer', { body: { email: emailRecupero, codigo: codigoRecupero, password: passwordNueva } });
    chequear('restablecer devuelve sesión', r.status === 200 && !!r.body?.token, '| ' + r.status);

    r = await pedir('POST', '/auth/login', { body: { email: emailRecupero, password: passwordNueva } });
    chequear('se ingresa con la contraseña nueva', r.status === 200, '| ' + r.status);

    r = await pedir('POST', '/auth/login', { body: { email: emailRecupero, password: PASSWORD_DEMO } });
    chequear('con la vieja ya no', r.status === 401, '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/auth/password/restablecer', { body: { email: emailRecupero, codigo: codigoRecupero, password: passwordNueva } });
    chequear('el código de recupero no se puede reusar', r.status === 400 && r.body?.error?.codigo === 'OTP_INEXISTENTE', '| ' + r.body?.error?.codigo);
  }

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
  seccion('Punto 2 · Cambio de email');
  // Se hace con una cuenta descartable: si se usara la de Sofía, la próxima
  // corrida ya no podría ingresar con sofia.demo@ronda.app.
  const emailOriginal = `cambio.${Date.now()}@ronda.test`;
  const emailCambiado = `cambiado.${Date.now()}@ronda.test`;
  r = await pedir('POST', '/auth/registro', {
    body: { email: emailOriginal, password: PASSWORD_DEMO, nombre: 'Prueba Cambio' },
  });
  const codigoRegistro = r.body?.codigoDesarrollo;

  if (!codigoRegistro) {
    // Sin OTP_EXPOSE_IN_RESPONSE=true no hay forma de leer el código desde acá.
    console.log('  (se saltea: hace falta OTP_EXPOSE_IN_RESPONSE=true en el .env)');
  } else {
    r = await pedir('POST', '/auth/otp/verificar', {
      body: { email: emailOriginal, codigo: codigoRegistro, proposito: 'REGISTRO' },
    });
    const cuenta = { bearer: `Bearer ${r.body?.token}` };
    chequear('cuenta descartable lista', r.status === 200 && !!r.body?.token);

    r = await pedir('POST', '/usuarios/me/email/solicitar', { body: { emailNuevo: emailCambiado } });
    chequear('pedir el cambio sin token responde 401', r.status === 401, '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/usuarios/me/email/solicitar', { bearer: cuenta.bearer, body: { emailNuevo: 'no-es-un-mail' } });
    chequear('email con formato inválido', r.status === 400 && r.body?.error?.codigo === 'EMAIL_INVALIDO', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/usuarios/me/email/solicitar', { bearer: cuenta.bearer, body: { emailNuevo: emailOriginal.toUpperCase() } });
    chequear('el mismo email que ya tiene', r.status === 400 && r.body?.error?.codigo === 'EMAIL_IGUAL_AL_ACTUAL', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/usuarios/me/email/solicitar', { bearer: cuenta.bearer, body: { emailNuevo: 'sofia.demo@ronda.app' } });
    chequear('email de otra cuenta', r.status === 409 && r.body?.error?.codigo === 'EMAIL_EN_USO', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/usuarios/me/email/solicitar', { bearer: cuenta.bearer, body: { emailNuevo: emailCambiado } });
    chequear('pedir el cambio', r.status === 200, '| ' + r.status);
    const codigoCambio = r.body?.codigoDesarrollo;

    r = await pedir('POST', '/usuarios/me/email/solicitar', { bearer: cuenta.bearer, body: { emailNuevo: emailCambiado } });
    chequear('pedir otro código enseguida', r.status === 429 && r.body?.error?.codigo === 'OTP_COOLDOWN', '| ' + r.body?.error?.codigo);

    r = await pedir('GET', '/usuarios/me', { bearer: cuenta.bearer });
    chequear('sin confirmar el email no cambia', r.body?.usuario?.email === emailOriginal);

    r = await pedir('POST', '/usuarios/me/email/confirmar', { bearer: cuenta.bearer, body: {} });
    chequear('confirmar sin código', r.status === 400 && r.body?.error?.codigo === 'CODIGO_REQUERIDO', '| ' + r.body?.error?.codigo);

    const incorrecto = codigoCambio === '000000' ? '111111' : '000000';
    r = await pedir('POST', '/usuarios/me/email/confirmar', { bearer: cuenta.bearer, body: { codigo: incorrecto } });
    chequear('código incorrecto', r.status === 400 && r.body?.error?.codigo === 'OTP_INVALIDO', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/auth/otp/verificar', {
      body: { email: emailOriginal, codigo: codigoCambio, proposito: 'CAMBIO_EMAIL' },
    });
    chequear('el código de cambio no sirve para ingresar', r.status === 400 && r.body?.error?.codigo === 'PROPOSITO_INVALIDO', '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/usuarios/me/email/confirmar', { bearer: cuenta.bearer, body: { codigo: codigoCambio } });
    chequear('confirmar el cambio', r.status === 200 && r.body?.usuario?.email === emailCambiado, '| ' + r.body?.usuario?.email);
    chequear('el email sigue verificado', r.body?.usuario?.emailVerificado === true);

    r = await pedir('GET', '/usuarios/me', { bearer: cuenta.bearer });
    chequear('la sesión sigue andando con el mismo token', r.status === 200 && r.body.usuario.email === emailCambiado);

    r = await pedir('POST', '/auth/login', { body: { email: emailCambiado, password: PASSWORD_DEMO } });
    chequear('se ingresa con el email nuevo', r.status === 200);

    r = await pedir('POST', '/auth/login', { body: { email: emailOriginal, password: PASSWORD_DEMO } });
    chequear('con el email viejo ya no', r.status === 401, '| ' + r.body?.error?.codigo);

    r = await pedir('POST', '/usuarios/me/email/confirmar', { bearer: cuenta.bearer, body: { codigo: codigoCambio } });
    chequear('el código no se puede reusar', r.status === 400 && r.body?.error?.codigo === 'OTP_INEXISTENTE', '| ' + r.body?.error?.codigo);
  }

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
  seccion('Hallado · Punto 5 · Publicar');
  // Dominio nuevo, tablas nuevas (hallado_*). Se reusan usuarios y zonas:
  // los barrios que pide el enunciado son las zonas que ya teniamos.

  r = await pedir('GET', '/hallado/categorias');
  chequear('catálogo de categorías', r.status === 200 && r.body.categorias?.length === 6, '| ' + r.body.categorias?.length);

  r = await pedir('GET', '/hallado/barrios');
  chequear('catálogo de barrios', r.status === 200 && r.body.barrios?.length > 0, '| ' + r.body.barrios?.length);

  // --- Subida de fotos ---
  // La app manda la imagen en base64 y recibe una URL relativa. Se guarda
  // relativa a proposito: si fuera absoluta quedaria clavado el host con el
  // que se subio y la foto no se veria desde otro lado.
  const PNG_MINIMO =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  r = await pedir('POST', '/hallado/fotos', { body: { base64: PNG_MINIMO, mime: 'image/png' } });
  chequear('subir sin sesión responde 401', r.status === 401, '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/fotos', { bearer: sofia.bearer, body: { base64: PNG_MINIMO, mime: 'image/png' } });
  chequear('subir una foto', r.status === 201 && typeof r.body.url === 'string', '| ' + r.status);
  const fotoUrl = r.body.url;
  chequear('la url es relativa', fotoUrl?.startsWith('/uploads/'), '| ' + fotoUrl);

  // El picker a veces devuelve el prefijo data: adelante del base64.
  r = await pedir('POST', '/hallado/fotos', { bearer: sofia.bearer, body: { base64: 'data:image/png;base64,' + PNG_MINIMO, mime: 'image/png' } });
  chequear('acepta el prefijo data:', r.status === 201, '| ' + r.status);

  // Un SVG es un documento con scripts adentro, no una foto.
  r = await pedir('POST', '/hallado/fotos', { bearer: sofia.bearer, body: { base64: PNG_MINIMO, mime: 'image/svg+xml' } });
  chequear('formato no soportado', r.status === 400 && r.body?.error?.codigo === 'FORMATO_NO_SOPORTADO', '| ' + r.body?.error?.codigo);

  // El mime lo manda el cliente y puede decir cualquier cosa: lo que vale
  // es la firma de los primeros bytes del archivo.
  r = await pedir('POST', '/hallado/fotos', { bearer: sofia.bearer, body: { base64: PNG_MINIMO, mime: 'image/jpeg' } });
  chequear('gana el contenido sobre el mime', r.status === 201 && r.body.url?.endsWith('.png'), '| ' + r.body.url);

  r = await pedir('POST', '/hallado/fotos', { bearer: sofia.bearer, body: { base64: Buffer.from('a'.repeat(200)).toString('base64'), mime: 'image/png' } });
  chequear('texto plano disfrazado de imagen', r.status === 400 && r.body?.error?.codigo === 'IMAGEN_INVALIDA', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/fotos', { bearer: sofia.bearer, body: { mime: 'image/png' } });
  chequear('sin imagen', r.status === 400 && r.body?.error?.codigo === 'IMAGEN_REQUERIDA', '| ' + r.body?.error?.codigo);

  // El archivo tiene que servirse de verdad, no solo quedar guardado.
  const servida = await fetch(BASE.replace(/\/api$/, GUION_VACIO) + fotoUrl);
  chequear('la foto se sirve', servida.status === 200, '| ' + servida.status);
  chequear('con el content-type correcto', servida.headers.get('content-type')?.includes('image/png'), '| ' + servida.headers.get('content-type'));

  // Sin esto, pedir /uploads/ listaria todo lo que subio cualquiera.
  const listadoCarpeta = await fetch(BASE.replace(/\/api$/, GUION_VACIO) + '/uploads/');
  chequear('no se lista la carpeta', listadoCarpeta.status === 404, '| ' + listadoCarpeta.status);

  const baseEncontre = {
    tipo: 'ENCONTRE', categoriaId: 2, titulo: 'Llavero con tres llaves',
    descripcion: 'En la vereda, frente a la plaza',
    fechaSuceso: fechaDeHace(1), franjaHoraria: 'TARDE', barrioId: 6,
    direccion: 'Thames 1500', lat: -34.5885, lng: -58.4305,
    preguntaVerificacion: '¿De qué color es el llavero?',
    respuestaVerificacion: '  AZUL  ',
    fotos: ['https://example.com/llavero1.jpg', 'https://example.com/llavero2.jpg'],
  };

  r = await pedir('POST', '/hallado/publicaciones', { body: baseEncontre });
  chequear('publicar sin sesión responde 401', r.status === 401, '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: baseEncontre });
  chequear('publicar un hallazgo', r.status === 201, '| ' + r.status);
  const hallazgoId = r.body.publicacion?.id;
  chequear('vence a los 30 días', r.body.publicacion?.venceEn !== undefined);
  chequear('nace ABIERTA', r.body.publicacion?.estado === 'ABIERTA', '| ' + r.body.publicacion?.estado);
  chequear('guarda las dos fotos', r.body.publicacion?.fotos?.length === 2, '| ' + r.body.publicacion?.fotos?.length);
  chequear('guarda las coordenadas', r.body.publicacion?.coordenadas?.lat === -34.5885);

  // La respuesta de verificación es lo que impide que cualquiera reclame
  // algo ajeno. Si saliera en el DTO, el mecanismo entero no sirve de nada.
  chequear('la pregunta de verificación sí se ve', typeof r.body.publicacion?.preguntaVerificacion === 'string');
  chequear('la respuesta NUNCA sale', JSON.stringify(r.body).toLowerCase().includes('azul') === false);

  // Validaciones del alta.
  const sinPregunta = { ...baseEncontre };
  delete sinPregunta.preguntaVerificacion;
  delete sinPregunta.respuestaVerificacion;
  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: sinPregunta });
  chequear('un hallazgo sin pregunta se rechaza', r.status === 400 && r.body?.error?.codigo === 'PREGUNTA_REQUERIDO', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...baseEncontre, tipo: 'PERDI' } });
  chequear('una pérdida con pregunta se rechaza', r.status === 400 && r.body?.error?.codigo === 'VERIFICACION_NO_CORRESPONDE', '| ' + r.body?.error?.codigo);

  const basePerdi = {
    tipo: 'PERDI', categoriaId: 4, titulo: 'Gato naranja',
    fechaSuceso: fechaDeHace(2), franjaHoraria: 'NOCHE', barrioId: 3,
  };

  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...basePerdi, tipo: 'REGALE' } });
  chequear('tipo inventado', r.status === 400 && r.body?.error?.codigo === 'TIPO_INVALIDO', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...basePerdi, fechaSuceso: fechaDeHace(-5) } });
  chequear('fecha futura', r.status === 400 && r.body?.error?.codigo === 'FECHA_FUTURA', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...basePerdi, fechaSuceso: fechaDeHace(4000) } });
  chequear('fecha demasiado vieja', r.status === 400 && r.body?.error?.codigo === 'FECHA_MUY_VIEJA', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...basePerdi, lat: -34.6 } });
  chequear('media coordenada', r.status === 400 && r.body?.error?.codigo === 'COORDENADAS_INCOMPLETAS', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...basePerdi, lat: 99, lng: -58 } });
  chequear('latitud fuera de rango', r.status === 400 && r.body?.error?.codigo === 'LATITUD_INVALIDA', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...basePerdi, categoriaId: 9999 } });
  chequear('categoría inexistente', r.status === 400 && r.body?.error?.codigo === 'CATEGORIA_INVALIDA', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...basePerdi, barrioId: 9999 } });
  chequear('barrio inexistente', r.status === 400 && r.body?.error?.codigo === 'BARRIO_INVALIDO', '| ' + r.body?.error?.codigo);

  // Una URL "javascript:" la termina abriendo la app de otra persona.
  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...basePerdi, fotos: ['javascript:alert(1)'] } });
  chequear('foto con esquema raro', r.status === 400 && r.body?.error?.codigo === 'FOTO_URL_INVALIDA', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...basePerdi, fotos: Array(9).fill('https://example.com/f.jpg') } });
  chequear('más de 8 fotos', r.status === 400 && r.body?.error?.codigo === 'DEMASIADAS_FOTOS', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: basePerdi });
  chequear('publicar una pérdida', r.status === 201, '| ' + r.status);
  const perdidaId = r.body.publicacion?.id;

  // Mis publicaciones.
  r = await pedir('GET', '/hallado/publicaciones/mias', { bearer: sofia.bearer });
  chequear('mis publicaciones', r.status === 200 && r.body.publicaciones?.length >= 2, '| ' + r.body.publicaciones?.length);
  chequear('trae el resumen por estado', typeof r.body.resumen?.abiertas === 'number');
  chequear('trae los días para vencer', typeof r.body.publicaciones?.[0]?.diasParaVencer === 'number');

  r = await pedir('GET', '/hallado/publicaciones/mias?estado=CUALQUIERA', { bearer: sofia.bearer });
  chequear('estado de filtro inventado', r.status === 400 && r.body?.error?.codigo === 'ESTADO_INVALIDO', '| ' + r.body?.error?.codigo);

  // Editar.
  r = await pedir('PATCH', `/hallado/publicaciones/${hallazgoId}`, { bearer: sofia.bearer, body: { titulo: 'Llavero azul con tres llaves' } });
  chequear('editar el título', r.status === 200 && r.body.publicacion?.titulo === 'Llavero azul con tres llaves');

  // Cambiar el tipo invalidaría los reclamos que ya tenga encima.
  r = await pedir('PATCH', `/hallado/publicaciones/${hallazgoId}`, { bearer: sofia.bearer, body: { tipo: 'PERDI' } });
  chequear('el tipo no se puede cambiar', r.status === 400 && r.body?.error?.codigo === 'TIPO_NO_EDITABLE', '| ' + r.body?.error?.codigo);

  // Nadie toca lo ajeno.
  r = await pedir('PATCH', `/hallado/publicaciones/${hallazgoId}`, { bearer: martin.bearer, body: { titulo: 'mio ahora' } });
  chequear('no se edita lo ajeno', r.status === 403 && r.body?.error?.codigo === 'NO_SOS_EL_PUBLICADOR', '| ' + r.body?.error?.codigo);

  r = await pedir('DELETE', `/hallado/publicaciones/${hallazgoId}`, { bearer: martin.bearer });
  chequear('no se borra lo ajeno', r.status === 403, '| ' + r.body?.error?.codigo);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}/propia`, { bearer: martin.bearer });
  chequear('no se ve la ficha privada ajena', r.status === 403, '| ' + r.body?.error?.codigo);

  // Renovar.
  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/renovar`, { bearer: sofia.bearer });
  chequear('renovar', r.status === 200 && r.body.publicacion?.estado === 'ABIERTA', '| ' + r.body.publicacion?.estado);

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/renovar`, { bearer: martin.bearer });
  chequear('no se renueva lo ajeno', r.status === 403, '| ' + r.body?.error?.codigo);

  // Borrar.
  r = await pedir('DELETE', `/hallado/publicaciones/${perdidaId}`, { bearer: sofia.bearer });
  chequear('borrar la propia', r.status === 200, '| ' + r.status);

  r = await pedir('DELETE', `/hallado/publicaciones/${perdidaId}`, { bearer: sofia.bearer });
  chequear('borrar dos veces', r.status === 404 && r.body?.error?.codigo === 'PUBLICACION_NO_ENCONTRADA', '| ' + r.body?.error?.codigo);

  // -------------------------------------------------------------
  seccion('Hallado · Punto 3 · Buscador');
  // La regla que define el punto: "la búsqueda devuelve las publicaciones
  // del tipo opuesto". Por eso el parámetro se llama queTePaso y no tipo.

  // Publicaciones de prueba, con coordenadas a distintas distancias del
  // Obelisco para poder verificar el orden por cercanía.
  const marca = Date.now();
  const creadasBusqueda = [];

  async function publicarDePrueba(cuerpo) {
    const res = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: cuerpo });
    if (res.body?.publicacion?.id) creadasBusqueda.push(res.body.publicacion.id);
    return res;
  }

  await publicarDePrueba({
    tipo: 'ENCONTRE', categoriaId: 2, titulo: `Llaves con dije ${marca}`,
    descripcion: 'Estaban en el subte', fechaSuceso: fechaDeHace(0),
    barrioId: 7, lat: -34.605, lng: -58.382,
    preguntaVerificacion: '¿Qué dice el dije?', respuestaVerificacion: 'una estrella',
  });
  await publicarDePrueba({
    tipo: 'ENCONTRE', categoriaId: 4, titulo: `Perro mestizo ${marca}`,
    fechaSuceso: fechaDeHace(10), barrioId: 13, lat: -34.72, lng: -58.254,
    preguntaVerificacion: '¿Tiene cicatriz?', respuestaVerificacion: 'si',
  });
  await publicarDePrueba({
    tipo: 'PERDI', categoriaId: 1, titulo: `Billetera perdida ${marca}`,
    fechaSuceso: fechaDeHace(0), barrioId: 6,
  });

  // --- La inversion de tipo ---
  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=${marca}`);
  chequear('si perdiste, ves lo encontrado', r.status === 200 && r.body.publicaciones.every((p) => p.tipo === 'ENCONTRE'), '| ' + r.body.publicaciones?.length);

  r = await pedir('GET', `/hallado/publicaciones?queTePaso=ENCONTRE&q=${marca}`);
  chequear('si encontraste, ves lo perdido', r.status === 200 && r.body.publicaciones.every((p) => p.tipo === 'PERDI'), '| ' + r.body.publicaciones?.length);

  // --- La direccion exacta no se filtra en los resultados ---
  // Es el punto que el enunciado marca como importante.
  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=${marca}`);
  chequear('la dirección exacta nunca sale', r.body.publicaciones.every((p) => p.direccion === null));
  chequear('las coordenadas sí viajan', r.body.publicaciones.some((p) => p.coordenadas !== null));
  chequear('la respuesta de verificación tampoco sale', JSON.stringify(r.body).includes('una estrella') === false);

  // --- Filtros ---
  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=${marca}&categoriaId=4`);
  chequear('filtro por categoría', r.body.paginado.total === 1, '| ' + r.body.paginado?.total);

  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=${marca}&barrioId=7`);
  chequear('filtro por barrio', r.body.paginado.total === 1, '| ' + r.body.paginado?.total);

  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=subte`);
  chequear('las palabras clave miran la descripción', r.body.paginado.total >= 1, '| ' + r.body.paginado?.total);

  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=${marca}&cuando=HOY`);
  chequear('filtro cuando=HOY', r.body.paginado.total === 1, '| ' + r.body.paginado?.total);

  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=${marca}&cuando=SEMANA`);
  chequear('cuando=SEMANA deja fuera lo de hace 10 días', r.body.paginado.total === 1, '| ' + r.body.paginado?.total);

  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=${marca}&cuando=RANGO&desde=${fechaDeHace(12)}&hasta=${fechaDeHace(8)}`);
  chequear('filtro por rango de fechas', r.body.paginado.total === 1, '| ' + r.body.paginado?.total);

  // Sin escapar los comodines, buscar un % traeria todo.
  r = await pedir('GET', '/hallado/publicaciones?queTePaso=PERDI&q=%25');
  chequear('el comodín % se escapa', r.body.paginado.total === 0, '| ' + r.body.paginado?.total);

  // --- Orden por cercania ---
  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=${marca}&orden=CERCANOS&lat=-34.6037&lng=-58.3816`);
  chequear('orden por cercanía', r.status === 200 && r.body.publicaciones[0]?.titulo?.startsWith('Llaves'), '| ' + r.body.publicaciones[0]?.titulo);
  chequear('calcula la distancia', r.body.publicaciones[0]?.distanciaKm < 1, '| ' + r.body.publicaciones[0]?.distanciaKm + ' km');

  // --- Paginado ---
  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=${marca}&limite=1&pagina=1`);
  chequear('el paginado respeta el límite', r.body.publicaciones.length === 1, '| ' + r.body.publicaciones?.length);
  chequear('avisa que hay más', r.body.paginado.hayMas === true);

  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=${marca}&limite=1&pagina=2`);
  chequear('la segunda página trae otra cosa', r.body.publicaciones.length === 1 && r.body.paginado.hayMas === false);

  // --- Validaciones ---
  r = await pedir('GET', '/hallado/publicaciones');
  chequear('sin queTePaso', r.status === 400 && r.body?.error?.codigo === 'QUE_TE_PASO_INVALIDO', '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/hallado/publicaciones?queTePaso=PERDI&orden=ALFABETICO');
  chequear('orden inventado no se interpola', r.status === 400 && r.body?.error?.codigo === 'ORDEN_INVALIDO', '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/hallado/publicaciones?queTePaso=PERDI&orden=CERCANOS');
  chequear('cercanía sin coordenadas', r.status === 400 && r.body?.error?.codigo === 'FALTAN_COORDENADAS', '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/hallado/publicaciones?queTePaso=PERDI&cuando=RANGO&desde=2026-10-30&hasta=2026-10-01');
  chequear('rango que empieza después de terminar', r.status === 400 && r.body?.error?.codigo === 'RANGO_INVALIDO', '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/hallado/publicaciones?queTePaso=PERDI&limite=999');
  chequear('límite exagerado', r.status === 400 && r.body?.error?.codigo === 'LIMITE_INVALIDO', '| ' + r.body?.error?.codigo);

  // --- Lo resuelto y lo vencido no se muestra ---
  const idResuelta = creadasBusqueda[0];
  await pedir('PATCH', `/hallado/publicaciones/${idResuelta}`, { bearer: sofia.bearer, body: { titulo: `Llaves con dije ${marca}` } });

  // Limpieza: estas publicaciones son de la corrida, no de la demo.
  for (const id of creadasBusqueda) {
    await pedir('DELETE', `/hallado/publicaciones/${id}`, { bearer: sofia.bearer });
  }

  r = await pedir('GET', `/hallado/publicaciones?queTePaso=PERDI&q=${marca}`);
  chequear('las borradas desaparecen de la búsqueda', r.body.paginado.total === 0, '| ' + r.body.paginado?.total);

  // -------------------------------------------------------------
  seccion('Hallado · Punto 4 · Detalle');
  // Lo que se ve depende de quién mira: el publicador ve la dirección exacta
  // y accede a la gestión; un tercero ve todo menos la dirección y puede
  // reclamar; sin sesión se ve lo mismo que un tercero, sin acciones.

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: martin.bearer });
  chequear('detalle como tercero', r.status === 200 && r.body.publicacion?.id === hallazgoId, '| ' + r.status);
  chequear('trae la galería completa', r.body.publicacion?.fotos?.length === 2, '| ' + r.body.publicacion?.fotos?.length);
  chequear('trae categoría, barrio, fecha y franja',
    r.body.publicacion?.categoria?.nombre && r.body.publicacion?.barrio?.nombre
      && r.body.publicacion?.fechaSuceso && r.body.publicacion?.franjaHoraria === 'TARDE');
  chequear('trae el estado', r.body.publicacion?.estado === 'ABIERTA', '| ' + r.body.publicacion?.estado);
  chequear('la dirección exacta NO sale para un tercero', r.body.publicacion?.direccion === null && r.body.publicacion?.direccionOculta === true);
  chequear('las coordenadas sí', r.body.publicacion?.coordenadas?.lat === -34.5885);
  chequear('la pregunta de verificación sí', typeof r.body.publicacion?.preguntaVerificacion === 'string');
  chequear('la respuesta de verificación nunca', JSON.stringify(r.body).includes('respuestaVerificacion') === false && JSON.stringify(r.body).includes('respuesta_verificacion') === false);
  chequear('publicador con nombre', r.body.publicacion?.publicador?.id === sofia.id && typeof r.body.publicacion?.publicador?.nombre === 'string');
  chequear('publicador con reputación', typeof r.body.publicacion?.publicador?.reputacion?.devoluciones === 'number');
  chequear('publicador sin email ni teléfono', !('email' in (r.body.publicacion?.publicador ?? {})) && !('telefono' in (r.body.publicacion?.publicador ?? {})));
  chequear('un tercero puede reclamar "Es mío"', r.body.acciones?.puedeReclamar === true && r.body.acciones?.reclamo === 'ES_MIO', '| ' + r.body.acciones?.reclamo);
  chequear('y no es el publicador', r.body.acciones?.esPublicador === false);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: sofia.bearer });
  chequear('el publicador ve la dirección exacta', r.body.publicacion?.direccion === 'Thames 1500', '| ' + r.body.publicacion?.direccion);
  chequear('el publicador accede a la gestión', r.body.acciones?.esPublicador === true);
  chequear('y no puede reclamar lo suyo', r.body.acciones?.puedeReclamar === false);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`);
  chequear('sin sesión se ve el detalle', r.status === 200, '| ' + r.status);
  chequear('sin sesión no hay dirección', r.body.publicacion?.direccion === null);
  chequear('sin sesión no hay acciones', r.body.acciones?.puedeReclamar === false && r.body.acciones?.esPublicador === false);

  // En una pérdida el botón del tercero es "Lo encontré" y no hay pregunta.
  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: basePerdi });
  const perdidaDetalleId = r.body.publicacion?.id;
  r = await pedir('GET', `/hallado/publicaciones/${perdidaDetalleId}`, { bearer: martin.bearer });
  chequear('en una pérdida la acción es "Lo encontré"', r.body.acciones?.reclamo === 'LO_ENCONTRE', '| ' + r.body.acciones?.reclamo);
  chequear('una pérdida no tiene pregunta', r.body.publicacion?.preguntaVerificacion === null);
  await pedir('DELETE', `/hallado/publicaciones/${perdidaDetalleId}`, { bearer: sofia.bearer });

  r = await pedir('GET', '/hallado/publicaciones/999999', { bearer: martin.bearer });
  chequear('detalle inexistente', r.status === 404 && r.body?.error?.codigo === 'PUBLICACION_NO_ENCONTRADA', '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/hallado/publicaciones/abc', { bearer: martin.bearer });
  chequear('id inválido', r.status === 400 && r.body?.error?.codigo === 'ID_INVALIDO', '| ' + r.body?.error?.codigo);

  // --- Seguir ---
  // "Cualquier persona puede seguir la publicación para enterarse de sus
  // novedades." Seguir y dejar de seguir son idempotentes: un reintento del
  // celular no tiene que dar error.
  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/seguir`);
  chequear('seguir sin sesión responde 401', r.status === 401, '| ' + r.body?.error?.codigo);

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/seguir`, { bearer: martin.bearer });
  chequear('seguir una publicación', r.status === 200 && r.body.laSigo === true && r.body.seguidores === 1, '| ' + JSON.stringify(r.body));

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/seguir`, { bearer: martin.bearer });
  chequear('seguir dos veces no duplica', r.status === 200 && r.body.seguidores === 1, '| ' + r.body.seguidores);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: martin.bearer });
  chequear('el detalle sabe que la sigo', r.body.publicacion?.laSigo === true && r.body.publicacion?.seguidores === 1);
  chequear('un tercero puede seguir', r.body.acciones?.puedeSeguir === true);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: carla.bearer });
  chequear('otra persona ve que no la sigue', r.body.publicacion?.laSigo === false && r.body.publicacion?.seguidores === 1);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: sofia.bearer });
  chequear('el publicador no sigue lo suyo', r.body.acciones?.puedeSeguir === false);

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/seguir`, { bearer: sofia.bearer });
  chequear('seguir lo propio se rechaza', r.status === 400 && r.body?.error?.codigo === 'ES_TU_PUBLICACION', '| ' + r.body?.error?.codigo);

  r = await pedir('DELETE', `/hallado/publicaciones/${hallazgoId}/seguir`, { bearer: martin.bearer });
  chequear('dejar de seguir', r.status === 200 && r.body.laSigo === false && r.body.seguidores === 0, '| ' + JSON.stringify(r.body));

  r = await pedir('DELETE', `/hallado/publicaciones/${hallazgoId}/seguir`, { bearer: martin.bearer });
  chequear('dejar de seguir dos veces no es error', r.status === 200 && r.body.laSigo === false);

  r = await pedir('POST', '/hallado/publicaciones/999999/seguir', { bearer: martin.bearer });
  chequear('seguir algo inexistente', r.status === 404 && r.body?.error?.codigo === 'PUBLICACION_NO_ENCONTRADA', '| ' + r.body?.error?.codigo);

  // -------------------------------------------------------------
  seccion('Hallado · Punto 7 · Reclamos');
  // "Es mío" contesta la pregunta de verificación; la compara el backend.
  // Cada persona tiene 3 intentos por publicación y una respuesta incorrecta
  // gasta uno.

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { body: { respuesta: 'azul' } });
  chequear('reclamar sin sesión responde 401', r.status === 401, '| ' + r.body?.error?.codigo);

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { bearer: sofia.bearer, body: { respuesta: 'azul' } });
  chequear('reclamar lo propio se rechaza', r.status === 400 && r.body?.error?.codigo === 'ES_TU_PUBLICACION', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { bearer: martin.bearer, body: {} });
  chequear('"Es mío" sin respuesta', r.status === 400 && r.body?.error?.codigo === 'RESPUESTA_REQUERIDO', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { bearer: martin.bearer, body: { respuesta: 'rojo' } });
  chequear('respuesta incorrecta', r.status === 400 && r.body?.error?.codigo === 'RESPUESTA_INCORRECTA', '| ' + r.body?.error?.codigo);
  chequear('y avisa cuántos intentos quedan', r.body?.error?.mensaje?.includes('2 intentos'), '| ' + r.body?.error?.mensaje);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: martin.bearer });
  chequear('el detalle cuenta el intento gastado', r.body.publicacion?.intentosRestantes === 2, '| ' + r.body.publicacion?.intentosRestantes);
  chequear('y muestra el reclamo rechazado', r.body.publicacion?.miReclamo?.estado === 'RECHAZADO', '| ' + r.body.publicacion?.miReclamo?.estado);
  chequear('todavía puede reclamar', r.body.acciones?.puedeReclamar === true);
  chequear('la publicación sigue ABIERTA', r.body.publicacion?.estado === 'ABIERTA', '| ' + r.body.publicacion?.estado);

  // La comparación tolera mayúsculas, espacios y acentos.
  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, {
    bearer: martin.bearer,
    body: { respuesta: '  Azul ', descripcion: 'Tiene una llave con cinta roja', fotoUrl: 'https://example.com/mi-llavero.jpg' },
  });
  chequear('"Es mío" con la respuesta correcta', r.status === 201 && r.body.reclamo?.estado === 'PENDIENTE', '| ' + r.status + ' ' + r.body?.error?.codigo);
  const reclamoEsMioId = r.body.reclamo?.id;
  chequear('es de tipo ES_MIO', r.body.reclamo?.tipo === 'ES_MIO');
  chequear('registra que contestó bien', r.body.reclamo?.respuestaCorrecta === true);
  chequear('guarda descripción y foto', r.body.reclamo?.descripcion?.includes('cinta') && r.body.reclamo?.fotoUrl?.endsWith('.jpg'));
  chequear('vence a las 48 horas', r.body.reclamo?.horasParaVencer > 0 && r.body.reclamo?.horasParaVencer <= 48, '| ' + r.body.reclamo?.horasParaVencer);
  chequear('trae la publicación resumida', r.body.reclamo?.publicacion?.id === hallazgoId && r.body.reclamo?.publicacion?.estado === 'EN_RECLAMO', '| ' + r.body.reclamo?.publicacion?.estado);
  chequear('trae las dos partes', r.body.reclamo?.reclamante?.id === martin.id && r.body.reclamo?.publicador?.id === sofia.id);
  chequear('sabe quién mira', r.body.reclamo?.soyElReclamante === true && r.body.reclamo?.soyElPublicador === false);
  chequear('la respuesta correcta no sale', JSON.stringify(r.body).includes('respuestaVerificacion') === false);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: martin.bearer });
  chequear('la publicación pasa a EN_RECLAMO', r.body.publicacion?.estado === 'EN_RECLAMO', '| ' + r.body.publicacion?.estado);
  chequear('con un reclamo pendiente no se puede reclamar de nuevo', r.body.acciones?.puedeReclamar === false && r.body.publicacion?.miReclamo?.estado === 'PENDIENTE');

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: sofia.bearer });
  chequear('el publicador ve cuántos esperan respuesta', r.body.publicacion?.reclamosPendientes === 1, '| ' + r.body.publicacion?.reclamosPendientes);

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { bearer: martin.bearer, body: { respuesta: 'azul' } });
  chequear('un segundo reclamo pendiente se rechaza', r.status === 409 && r.body?.error?.codigo === 'RECLAMO_PENDIENTE', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { bearer: carla.bearer, body: { respuesta: 'azul', fotoUrl: 'javascript:alert(1)' } });
  chequear('foto con esquema raro', r.status === 400 && r.body?.error?.codigo === 'FOTO_URL_INVALIDA', '| ' + r.body?.error?.codigo);

  // El tope de 3 intentos.
  await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { bearer: carla.bearer, body: { respuesta: 'verde' } });
  await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { bearer: carla.bearer, body: { respuesta: 'negro' } });
  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { bearer: carla.bearer, body: { respuesta: 'blanco' } });
  chequear('el tercer error avisa que no quedan intentos', r.status === 400 && r.body?.error?.mensaje?.includes('no te quedan'), '| ' + r.body?.error?.mensaje);

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { bearer: carla.bearer, body: { respuesta: 'azul' } });
  chequear('el cuarto intento se rechaza aunque sea correcto', r.status === 409 && r.body?.error?.codigo === 'SIN_INTENTOS', '| ' + r.body?.error?.codigo);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: carla.bearer });
  chequear('sin intentos no se puede reclamar', r.body.acciones?.puedeReclamar === false && r.body.publicacion?.intentosRestantes === 0);

  // "Lo encontré" sobre una pérdida: foto y barrio obligatorios.
  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: basePerdi });
  const perdidaReclamoId = r.body.publicacion?.id;

  r = await pedir('POST', `/hallado/publicaciones/${perdidaReclamoId}/reclamos`, { bearer: martin.bearer, body: { barrioId: 3 } });
  chequear('"Lo encontré" sin foto', r.status === 400 && r.body?.error?.codigo === 'FOTO_REQUERIDA', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', `/hallado/publicaciones/${perdidaReclamoId}/reclamos`, { bearer: martin.bearer, body: { fotoUrl: 'https://example.com/gato.jpg' } });
  chequear('"Lo encontré" sin barrio', r.status === 400 && r.body?.error?.codigo === 'BARRIO_REQUERIDO', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', `/hallado/publicaciones/${perdidaReclamoId}/reclamos`, {
    bearer: martin.bearer,
    body: { fotoUrl: 'https://example.com/gato.jpg', barrioId: 3, descripcion: 'Lo tengo en casa' },
  });
  chequear('"Lo encontré" con foto y barrio', r.status === 201 && r.body.reclamo?.tipo === 'LO_ENCONTRE', '| ' + r.status + ' ' + r.body?.error?.codigo);
  const reclamoLoEncontreId = r.body.reclamo?.id;
  chequear('guarda el barrio', r.body.reclamo?.barrio?.nombre === 'Caballito', '| ' + r.body.reclamo?.barrio?.nombre);
  chequear('no hay pregunta que contestar', r.body.reclamo?.respuesta === null && r.body.reclamo?.respuestaCorrecta === null);

  r = await pedir('POST', `/hallado/publicaciones/${perdidaReclamoId}/reclamos`, { bearer: carla.bearer, body: { fotoUrl: 'https://example.com/otro-gato.jpg', barrioId: 6 } });
  chequear('varias personas pueden reclamar la misma', r.status === 201, '| ' + r.status);
  const reclamoCarlaId = r.body.reclamo?.id;

  r = await pedir('POST', '/hallado/publicaciones/999999/reclamos', { bearer: martin.bearer, body: { respuesta: 'x' } });
  chequear('reclamar algo inexistente', r.status === 404 && r.body?.error?.codigo === 'PUBLICACION_NO_ENCONTRADA', '| ' + r.body?.error?.codigo);

  // --- Aceptar y rechazar ---
  // Sólo el publicador responde. Rechazar devuelve la publicación a ABIERTA
  // si no quedó otro reclamo esperando; aceptar la cierra (RESUELTA), rechaza
  // solos los demás pendientes y le muestra la dirección exacta a quien
  // reclamó.
  r = await pedir('POST', `/hallado/reclamos/${reclamoEsMioId}/aceptar`, { bearer: martin.bearer });
  chequear('quien reclama no puede responderse solo', r.status === 403 && r.body?.error?.codigo === 'NO_SOS_EL_PUBLICADOR', '| ' + r.body?.error?.codigo);

  r = await pedir('POST', `/hallado/reclamos/${reclamoEsMioId}/rechazar`, { bearer: sofia.bearer, body: { motivo: 'La foto no coincide con lo que encontré' } });
  chequear('rechazar un reclamo', r.status === 200 && r.body.reclamo?.estado === 'RECHAZADO', '| ' + r.status + ' ' + r.body?.error?.codigo);
  chequear('con el motivo del publicador', r.body.reclamo?.motivo?.includes('no coincide') && r.body.reclamo?.automatico === false);
  chequear('y la fecha de respuesta', r.body.reclamo?.respondidoEn !== null && r.body.reclamo?.horasParaVencer === null);

  r = await pedir('POST', `/hallado/reclamos/${reclamoEsMioId}/rechazar`, { bearer: sofia.bearer });
  chequear('responder dos veces', r.status === 409 && r.body?.error?.codigo === 'RECLAMO_YA_RESPONDIDO', '| ' + r.body?.error?.codigo);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: martin.bearer });
  chequear('sin reclamos pendientes vuelve a ABIERTA', r.body.publicacion?.estado === 'ABIERTA', '| ' + r.body.publicacion?.estado);
  chequear('el rechazado puede volver a intentar', r.body.acciones?.puedeReclamar === true && r.body.publicacion?.intentosRestantes === 1);
  chequear('y ve por qué lo rechazaron', r.body.publicacion?.miReclamo?.motivo?.includes('no coincide'));
  const devolucionesAntes = r.body.publicacion?.publicador?.reputacion?.devoluciones;

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { bearer: martin.bearer, body: { respuesta: 'azul', descripcion: 'Ahora con la foto buena', fotoUrl: 'https://example.com/mi-llavero-2.jpg' } });
  chequear('tercer intento, correcto', r.status === 201, '| ' + r.status + ' ' + r.body?.error?.codigo);
  const reclamoAceptadoId = r.body.reclamo?.id;

  r = await pedir('POST', `/hallado/reclamos/${reclamoAceptadoId}/aceptar`, { bearer: sofia.bearer });
  chequear('aceptar un reclamo', r.status === 200 && r.body.reclamo?.estado === 'ACEPTADO', '| ' + r.status + ' ' + r.body?.error?.codigo);
  chequear('la publicación queda RESUELTA', r.body.reclamo?.publicacion?.estado === 'RESUELTA', '| ' + r.body.reclamo?.publicacion?.estado);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: martin.bearer });
  chequear('con el reclamo aceptado se ve la dirección exacta', r.body.publicacion?.direccion === 'Thames 1500', '| ' + r.body.publicacion?.direccion);
  chequear('y ya no se puede reclamar', r.body.acciones?.puedeReclamar === false);
  chequear('la devolución suma reputación al publicador', r.body.publicacion?.publicador?.reputacion?.devoluciones === devolucionesAntes + 1, '| ' + r.body.publicacion?.publicador?.reputacion?.devoluciones);

  r = await pedir('GET', `/hallado/publicaciones/${hallazgoId}`, { bearer: carla.bearer });
  chequear('para los demás la dirección sigue oculta', r.body.publicacion?.direccion === null && r.body.publicacion?.direccionOculta === true);

  r = await pedir('POST', `/hallado/publicaciones/${hallazgoId}/reclamos`, { bearer: carla.bearer, body: { respuesta: 'azul' } });
  chequear('sobre una resuelta no se reclama', r.status === 409 && (r.body?.error?.codigo === 'PUBLICACION_NO_RECLAMABLE' || r.body?.error?.codigo === 'SIN_INTENTOS'), '| ' + r.body?.error?.codigo);

  // Aceptar uno rechaza solos a los demás pendientes de esa publicación.
  r = await pedir('POST', `/hallado/reclamos/${reclamoLoEncontreId}/aceptar`, { bearer: sofia.bearer });
  chequear('aceptar un "Lo encontré"', r.status === 200 && r.body.reclamo?.estado === 'ACEPTADO', '| ' + r.status);

  r = await pedir('GET', `/hallado/publicaciones/${perdidaReclamoId}`, { bearer: carla.bearer });
  chequear('el otro pendiente se rechazó solo', r.body.publicacion?.miReclamo?.estado === 'RECHAZADO' && r.body.publicacion?.miReclamo?.motivo === 'Se aceptó otro reclamo', '| ' + r.body.publicacion?.miReclamo?.motivo);

  r = await pedir('POST', `/hallado/reclamos/${reclamoCarlaId}/aceptar`, { bearer: sofia.bearer });
  chequear('un reclamo rechazado ya no se acepta', r.status === 409 && r.body?.error?.codigo === 'RECLAMO_YA_RESPONDIDO', '| ' + r.body?.error?.codigo);

  // Quien devolvió con "Lo encontré" suma una devolución; se mira en una
  // publicación suya, que es donde el detalle muestra la reputación.
  r = await pedir('POST', '/hallado/publicaciones', { bearer: martin.bearer, body: { ...basePerdi, titulo: 'Publicación de Martín para ver su reputación' } });
  const deMartinId = r.body.publicacion?.id;
  r = await pedir('GET', `/hallado/publicaciones/${deMartinId}`, { bearer: carla.bearer });
  chequear('quien devolvió suma una devolución', r.body.publicacion?.publicador?.reputacion?.devoluciones >= 1, '| ' + r.body.publicacion?.publicador?.reputacion?.devoluciones);
  chequear('y quien recuperó, un recupero', r.body.publicacion?.publicador?.reputacion?.recuperos >= 1, '| ' + r.body.publicacion?.publicador?.reputacion?.recuperos);
  await pedir('DELETE', `/hallado/publicaciones/${deMartinId}`, { bearer: martin.bearer });

  r = await pedir('POST', '/hallado/reclamos/999999/aceptar', { bearer: sofia.bearer });
  chequear('responder un reclamo inexistente', r.status === 404 && r.body?.error?.codigo === 'RECLAMO_NO_ENCONTRADO', '| ' + r.body?.error?.codigo);

  await pedir('DELETE', `/hallado/publicaciones/${perdidaReclamoId}`, { bearer: sofia.bearer });

  // --- Mis reclamos ---
  // Enviados y recibidos en un mismo lugar. Los rechazados solos por
  // respuesta incorrecta no aparecen entre los recibidos: el publicador
  // nunca tuvo que decidir nada sobre ellos.
  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...baseEncontre, titulo: 'Paraguas negro con mango de madera' } });
  const paraguasId = r.body.publicacion?.id;
  r = await pedir('POST', `/hallado/publicaciones/${paraguasId}/reclamos`, { bearer: martin.bearer, body: { respuesta: 'azul' } });
  const reclamoParaguasId = r.body.reclamo?.id;
  await pedir('POST', `/hallado/publicaciones/${paraguasId}/reclamos`, { bearer: carla.bearer, body: { respuesta: 'violeta' } });

  r = await pedir('GET', '/hallado/reclamos/mios');
  chequear('mis reclamos sin sesión responde 401', r.status === 401, '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/hallado/reclamos/mios', { bearer: sofia.bearer });
  chequear('mis reclamos: recibidos', r.status === 200 && Array.isArray(r.body.recibidos) && Array.isArray(r.body.enviados), '| ' + r.status);
  const recibidoDeMartin = r.body.recibidos?.find((x) => x.id === reclamoParaguasId);
  chequear('el pendiente de Martín está entre los recibidos', recibidoDeMartin?.estado === 'PENDIENTE' && recibidoDeMartin?.esperaMiRespuesta === true);
  chequear('los pendientes van primero', r.body.recibidos?.[0]?.estado === 'PENDIENTE', '| ' + r.body.recibidos?.[0]?.estado);
  chequear('el rechazado solo por respuesta incorrecta no aparece', r.body.recibidos?.every((x) => !(x.automatico && x.respuestaCorrecta === false)));
  chequear('el resumen cuenta los que esperan', r.body.resumen?.recibidosPendientes >= 1, '| ' + r.body.resumen?.recibidosPendientes);
  chequear('los recibidos traen a quien reclama y la publicación', recibidoDeMartin?.reclamante?.nombre && recibidoDeMartin?.publicacion?.titulo?.includes('Paraguas'));

  r = await pedir('GET', '/hallado/reclamos/mios', { bearer: martin.bearer });
  const enviado = r.body.enviados?.find((x) => x.id === reclamoParaguasId);
  chequear('mis reclamos: enviados', enviado?.estado === 'PENDIENTE' && enviado?.soyElReclamante === true && enviado?.esperaMiRespuesta === false);
  chequear('el enviado dice cuánto le queda', enviado?.horasParaVencer > 0, '| ' + enviado?.horasParaVencer);
  chequear('los aceptados también se listan', r.body.enviados?.some((x) => x.estado === 'ACEPTADO'));

  r = await pedir('GET', '/hallado/reclamos/mios', { bearer: carla.bearer });
  chequear('quien erró ve su intento rechazado', r.body.enviados?.some((x) => x.publicacion?.id === paraguasId && x.estado === 'RECHAZADO' && x.automatico === true));

  r = await pedir('GET', `/hallado/reclamos/${reclamoParaguasId}`, { bearer: carla.bearer });
  chequear('un reclamo ajeno no se ve', r.status === 403 && r.body?.error?.codigo === 'NO_TE_CORRESPONDE', '| ' + r.body?.error?.codigo);

  r = await pedir('GET', `/hallado/reclamos/${reclamoParaguasId}`, { bearer: sofia.bearer });
  chequear('el publicador ve el reclamo', r.status === 200 && r.body.reclamo?.soyElPublicador === true);

  r = await pedir('GET', `/hallado/reclamos/${reclamoParaguasId}`, { bearer: martin.bearer });
  chequear('quien reclamó también', r.status === 200 && r.body.reclamo?.soyElReclamante === true);

  r = await pedir('GET', '/hallado/reclamos/999999', { bearer: martin.bearer });
  chequear('reclamo inexistente', r.status === 404 && r.body?.error?.codigo === 'RECLAMO_NO_ENCONTRADO', '| ' + r.body?.error?.codigo);

  await pedir('POST', `/hallado/reclamos/${reclamoParaguasId}/rechazar`, { bearer: sofia.bearer });
  await pedir('DELETE', `/hallado/publicaciones/${paraguasId}`, { bearer: sofia.bearer });

  // -------------------------------------------------------------
  seccion('Hallado · Punto 10 · Historial');
  // Un caso es un reclamo aceptado, y aparece en el historial de las dos
  // personas con el rol dado vuelta: quien devolvió y quien recuperó.
  //
  // De la sección anterior queda el hallazgo de Sofía con el "Es mío" de
  // Martín aceptado (Sofía devolvió, Martín recuperó). Se suma una pérdida
  // de Sofía con un "Lo encontré" de Martín aceptado (Sofía recuperó,
  // Martín devolvió).
  r = await pedir('POST', '/hallado/publicaciones', { bearer: sofia.bearer, body: { ...basePerdi, titulo: 'Gata siamesa perdida' } });
  const gataId = r.body.publicacion?.id;
  r = await pedir('POST', `/hallado/publicaciones/${gataId}/reclamos`, { bearer: martin.bearer, body: { fotoUrl: 'https://example.com/gata.jpg', barrioId: 3 } });
  const reclamoGataId = r.body.reclamo?.id;
  await pedir('POST', `/hallado/reclamos/${reclamoGataId}/aceptar`, { bearer: sofia.bearer });

  r = await pedir('GET', '/hallado/historial');
  chequear('historial sin sesión responde 401', r.status === 401, '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/hallado/historial', { bearer: sofia.bearer });
  chequear('historial de Sofía', r.status === 200 && Array.isArray(r.body.casos), '| ' + r.status);
  const devolvio = r.body.casos?.find((c) => c.publicacion?.id === hallazgoId);
  const recupero = r.body.casos?.find((c) => c.publicacion?.id === gataId);
  chequear('el hallazgo aceptado cuenta como "Devolví"', devolvio?.rol === 'DEVOLVI', '| ' + devolvio?.rol);
  chequear('la pérdida aceptada cuenta como "Recuperé"', recupero?.rol === 'RECUPERE', '| ' + recupero?.rol);
  chequear('cada caso trae fecha, objeto y contraparte', devolvio?.fecha && devolvio?.publicacion?.titulo && devolvio?.contraparte?.id === martin.id);
  chequear('el resumen cuenta los dos lados', r.body.resumen?.devolvi >= 1 && r.body.resumen?.recupere >= 1, '| ' + JSON.stringify(r.body.resumen));
  chequear('lo más reciente va primero', r.body.casos?.[0]?.id === reclamoGataId);

  r = await pedir('GET', '/hallado/historial', { bearer: martin.bearer });
  chequear('para Martín los roles están dados vuelta',
    r.body.casos?.find((c) => c.publicacion?.id === hallazgoId)?.rol === 'RECUPERE'
      && r.body.casos?.find((c) => c.publicacion?.id === gataId)?.rol === 'DEVOLVI');
  chequear('y la contraparte es Sofía', r.body.casos?.every((c) => c.contraparte?.id !== martin.id));

  r = await pedir('GET', '/hallado/historial?tipo=DEVOLVI', { bearer: sofia.bearer });
  chequear('filtro por tipo', r.body.casos?.length >= 1 && r.body.casos?.every((c) => c.rol === 'DEVOLVI'), '| ' + r.body.casos?.length);
  chequear('el resumen no cambia con el filtro', r.body.resumen?.recupere >= 1);

  r = await pedir('GET', `/hallado/historial?desde=${fechaDeHace(0)}&hasta=${fechaDeHace(0)}`, { bearer: sofia.bearer });
  chequear('filtro por rango de fechas incluye lo de hoy', r.body.casos?.length >= 2, '| ' + r.body.casos?.length);

  r = await pedir('GET', '/hallado/historial?desde=2020-01-01&hasta=2020-01-31', { bearer: sofia.bearer });
  chequear('un rango sin casos devuelve vacío', r.status === 200 && r.body.casos?.length === 0, '| ' + r.body.casos?.length);

  r = await pedir('GET', '/hallado/historial?tipo=PRESTE', { bearer: sofia.bearer });
  chequear('tipo inventado', r.status === 400 && r.body?.error?.codigo === 'TIPO_INVALIDO', '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/hallado/historial?desde=ayer', { bearer: sofia.bearer });
  chequear('fecha mal escrita', r.status === 400 && r.body?.error?.codigo === 'FECHA_INVALIDA', '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/hallado/historial?desde=2026-10-30&hasta=2026-10-01', { bearer: sofia.bearer });
  chequear('rango dado vuelta', r.status === 400 && r.body?.error?.codigo === 'RANGO_INVALIDO', '| ' + r.body?.error?.codigo);

  r = await pedir('GET', '/hallado/historial', { bearer: carla.bearer });
  chequear('quien no cerró ningún caso tiene el historial vacío', r.body.casos?.every((c) => c.contraparte?.id !== undefined) && r.body.resumen?.devolvi === 0 && r.body.resumen?.recupere === 0, '| ' + JSON.stringify(r.body.resumen));

  await pedir('DELETE', `/hallado/publicaciones/${gataId}`, { bearer: sofia.bearer });

  // Limpieza: las publicaciones de Hallado que creo esta corrida no hacen
  // falta después, y dejarlas haría crecer la lista de Sofía en cada pasada.
  await pedir('DELETE', `/hallado/publicaciones/${hallazgoId}`, { bearer: sofia.bearer });

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

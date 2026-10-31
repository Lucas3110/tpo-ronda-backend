// Carga publicaciones de ejemplo de Hallado para poder probar y grabar la
// demo del buscador, los resultados y "Mis publicaciones" sin tener que dar
// de alta veinte cosas a mano.
//
//   npm run db:seed:hallado
//   npm run db:seed:hallado -- --usuario tu.email@gmail.com
//   npm run db:seed:hallado -- --limpiar
//
// Con --usuario, ademas de las publicaciones de los vecinos demo crea cinco
// a nombre de esa cuenta, una por estado, para que "Mis publicaciones" tenga
// los cuatro badges, y los reclamos y valoraciones que hacen falta para
// recorrer los puntos 4, 7 y 10 en la demo: un reclamo recibido esperando
// respuesta, uno enviado, un caso en "Devolví" ya valorado por la otra
// parte (con agradecimiento publico) y uno en "Recupere" todavia sin
// valorar. Sin ese flag solo siembra lo que se busca.
//
// Siempre crea ademas perfil.demo@hallado.demo (clave demo1234), la cuenta
// para mostrar el perfil del punto 2: un año de antiguedad, casos resueltos
// para tres de las cuatro insignias y el progreso de la cuarta, valoraciones
// positivas y una negativa, agradecimientos publicos, y reclamos aceptados
// con una contraparte que comparte el telefono y otra que no.
//
// Es idempotente: borra lo que sembro antes y lo vuelve a crear, asi siempre
// queda el mismo set conocido.
//
// NO se usa en la entrega final: son datos de prueba.
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

const PASSWORD_DEMO = 'demo1234';
const DIAS_DE_VIGENCIA = 30;

// Dominio propio para poder borrarlos sin tocar nada mas.
//
// Lucia no comparte el telefono y los otros dos si: en un reclamo aceptado
// se ven los dos casos del punto 2 (el numero, o "prefiere la app").
const VECINOS = [
  { email: 'vecina.demo@hallado.demo', nombre: 'Lucía Ferrari', telefono: '11 5555-1111', barrio: 'Palermo', telefonoVisible: false },
  { email: 'vecino.demo@hallado.demo', nombre: 'Diego Arrieta', telefono: '11 5555-2222', barrio: 'Belgrano', telefonoVisible: true },
  { email: 'kiosco.demo@hallado.demo', nombre: 'Kiosco La Esquina', telefono: '11 5555-3333', barrio: 'Caballito', telefonoVisible: true },
];

// La cuenta del perfil (punto 2). Registrada hace mas de un año para que la
// antiguedad se lea en años y no en dias.
const CUENTA_PERFIL = {
  email: 'perfil.demo@hallado.demo',
  nombre: 'Martina Ruiz',
  telefono: '11 5555-0000',
  barrio: 'Almagro',
  foto: 'https://picsum.photos/seed/hallado-perfil-demo/400/400',
  antiguedadDias: 400,
};

// Sus casos resueltos, uno por reclamo aceptado.
//
//   devolvi   true si Martina devolvio el objeto, false si lo recupero.
//   publica   quien publico: 'yo' (Martina) o 'vecino'. Junto con devolvi
//             define el tipo de la publicacion y del reclamo.
//   vecino    indice en VECINOS de la contraparte.
//   dias      hace cuantos dias se acepto el reclamo.
//   valoracion la que le dejo la contraparte (null si no la valoro). El
//             agradecimiento solo lo deja quien recupero, o sea en los
//             casos devolvi.
//
// Suman 7 devoluciones (Primera devolucion y Vecino solidario), 5
// agradecimientos (Agradecido por la comunidad) y 8 positivas: Muy
// recomendado queda en 8 de 10, para mostrar tambien el progreso. La
// negativa muestra que la reputacion cuenta las dos.
//
// Los de mas de 7 dias Martina ya los valoro (la ventana del punto 10
// cerro); el de hace 2 dias todavia lo puede valorar en la demo.
const CASOS_PERFIL = [
  { devolvi: true, publica: 'yo', vecino: 0, dias: 300, t: 'Encontré un llavero con un dije de gato', cat: 'Llaves', barrio: 'Almagro',
    valoracion: { tipo: 'POSITIVA', mensaje: 'Súper atenta, me esperó a la salida del trabajo.', agradecimiento: 'Gracias Martina, eran las llaves de casa y del trabajo. Me salvaste.' } },
  { devolvi: false, publica: 'yo', vecino: 1, dias: 250, t: 'Perdí una carpeta con apuntes de la facultad', cat: 'Otros', barrio: 'Almagro',
    valoracion: { tipo: 'POSITIVA', mensaje: 'Coordinamos rápido, muy amable.' } },
  { devolvi: true, publica: 'yo', vecino: 1, dias: 210, t: 'Encontré una mochila escolar azul', cat: 'Otros', barrio: 'Caballito',
    valoracion: { tipo: 'POSITIVA', mensaje: null, agradecimiento: 'Mi hijo tenía la tarea adentro. ¡Mil gracias!' } },
  { devolvi: true, publica: 'yo', vecino: 2, dias: 150, t: 'Encontré un celular Samsung en la plaza', cat: 'Electronica', barrio: 'Almagro',
    valoracion: null },
  { devolvi: false, publica: 'vecino', vecino: 2, dias: 120, t: 'Encontramos un paraguas verde en el local', cat: 'Otros', barrio: 'Caballito',
    valoracion: { tipo: 'POSITIVA', mensaje: 'Pasó a buscarlo el mismo día.' } },
  { devolvi: true, publica: 'vecino', vecino: 0, dias: 90, t: 'Se perdió mi perro Rocco', cat: 'Mascotas', barrio: 'Palermo',
    valoracion: { tipo: 'POSITIVA', mensaje: 'Lo encontró y me escribió enseguida.', agradecimiento: 'Rocco ya está en casa gracias a vos. Gracias por frenar y fijarte la chapita.' } },
  { devolvi: false, publica: 'yo', vecino: 0, dias: 60, t: 'Perdí mis anteojos de sol', cat: 'Otros', barrio: 'Almagro',
    valoracion: { tipo: 'NEGATIVA', mensaje: 'Tardó varios días en contestar los mensajes.' } },
  { devolvi: true, publica: 'yo', vecino: 1, dias: 45, t: 'Encontré un DNI en el colectivo', cat: 'Documentos', barrio: 'Belgrano',
    valoracion: { tipo: 'POSITIVA', mensaje: 'Todo perfecto.', agradecimiento: 'Me ahorraste el trámite de sacar el DNI de nuevo. ¡Gracias!' } },
  { devolvi: true, publica: 'vecino', vecino: 2, dias: 20, t: 'Perdimos las llaves del local', cat: 'Llaves', barrio: 'Caballito',
    valoracion: null },
  { devolvi: false, publica: 'yo', vecino: 1, dias: 10, t: 'Se escapó mi gato Simón', cat: 'Mascotas', barrio: 'Almagro',
    valoracion: { tipo: 'POSITIVA', mensaje: 'Simón estaba muy bien cuidado.' } },
  { devolvi: true, publica: 'yo', vecino: 0, dias: 2, t: 'Encontré una billetera violeta', cat: 'Documentos', barrio: 'Almagro',
    valoracion: { tipo: 'POSITIVA', mensaje: 'Me la trajo con todo adentro.', agradecimiento: 'Qué alivio, tenía todas las tarjetas. Gracias por la honestidad.' } },
];

// Las ENCONTRE son las que ve alguien que perdio algo, que es el caso que mas
// se muestra en la demo. Son catorce a proposito: el listado pide de a diez,
// asi que con catorce se ve el paginado por scroll (10 + 4).
//
// `dias` es hace cuantos dias paso, para poder probar los cuatro filtros de
// "¿Cuando?": hoy (0), ultimos 3 dias (<=3), ultima semana (<=7) y un rango.
const ENCONTRADAS = [
  { t: 'Llavero con llaves y control de alarma', cat: 'Llaves', barrio: 'Palermo', dias: 0, coords: true, fotos: 2, desc: 'Lo encontré en la vereda de Plaza Armenia, cerca de la feria.' },
  { t: 'Billetera de cuero marrón', cat: 'Documentos', barrio: 'Palermo', dias: 0, coords: true, fotos: 1, desc: 'Estaba arriba de un banco. Tiene documentos adentro, por eso no subo fotos del interior.' },
  { t: 'iPhone 13 negro con funda transparente', cat: 'Electronica', barrio: 'Belgrano', dias: 1, coords: true, fotos: 3, desc: 'Lo dejaron en el asiento del colectivo. Está bloqueado, no pude avisarle a nadie.' },
  { t: 'Perro caniche blanco sin collar', cat: 'Mascotas', barrio: 'Caballito', dias: 1, coords: true, fotos: 2, desc: 'Andaba solo por Parque Rivadavia. Lo tengo en casa, es muy manso.' },
  { t: 'Campera de jean azul talle M', cat: 'Ropa', barrio: 'Almagro', dias: 2, coords: false, fotos: 1, desc: 'Quedó colgada en el respaldo de una silla en un bar.' },
  { t: 'Anteojos recetados con funda negra', cat: 'Otros', barrio: 'Recoleta', dias: 2, coords: true, fotos: 1, desc: 'Estaban en el pasto, frente a la facultad.' },
  { t: 'DNI a nombre de M. Pérez', cat: 'Documentos', barrio: 'Flores', dias: 3, coords: false, fotos: 0, desc: 'No subo foto por los datos. Escribime y lo devolvemos.' },
  { t: 'Juego de llaves con llavero de Boca', cat: 'Llaves', barrio: 'San Telmo', dias: 4, coords: true, fotos: 1, desc: 'Las encontré en la feria de Plaza Dorrego, un domingo a la tarde.' },
  { t: 'Auriculares inalámbricos en su estuche', cat: 'Electronica', barrio: 'Villa Urquiza', dias: 5, coords: true, fotos: 2, desc: 'Estaban en el andén. Los guardé por si aparece el dueño.' },
  { t: 'Gato naranja con collar rojo', cat: 'Mascotas', barrio: 'Belgrano', dias: 6, coords: true, fotos: 2, desc: 'Tiene collar pero sin chapita. Está en casa, sano.' },
  { t: 'Mochila negra con una notebook adentro', cat: 'Otros', barrio: 'Palermo', dias: 8, coords: true, fotos: 2, desc: 'La dejaron en el gimnasio. La tiene guardada el encargado.' },
  { t: 'Tarjeta SUBE suelta', cat: 'Documentos', barrio: 'Caballito', dias: 10, coords: false, fotos: 1, desc: 'Estaba en el piso del subte. Tiene saldo.' },
  { t: 'Bufanda tejida gris', cat: 'Ropa', barrio: 'Recoleta', dias: 15, coords: false, fotos: 1, desc: 'Se le cayó a alguien en la plaza.' },
  { t: 'Reloj Casio plateado', cat: 'Electronica', barrio: 'Almagro', dias: 20, coords: true, fotos: 1, desc: 'Lo encontré en el vestuario del club.' },
];

// Las PERDI son las que ve alguien que encontro algo. Alcanzan cinco: sirven
// para mostrar que la busqueda devuelve el tipo opuesto, no para paginar.
const PERDIDAS = [
  { t: 'Perdí las llaves de mi auto', cat: 'Llaves', barrio: 'Palermo', dias: 0, coords: true, fotos: 1, desc: 'Llavero con control de un Gol Trend. Se me cayeron entre la plaza y la parada.' },
  { t: 'Perdí mi billetera con el DNI', cat: 'Documentos', barrio: 'Belgrano', dias: 1, coords: true, fotos: 0, desc: 'Billetera negra. Lo que más me importa es el DNI.' },
  { t: 'Se perdió mi gata siamesa', cat: 'Mascotas', barrio: 'Caballito', dias: 2, coords: true, fotos: 2, desc: 'Se escapó por el balcón. Es muy asustadiza, no se deja agarrar.' },
  { t: 'Perdí una campera de polar roja', cat: 'Ropa', barrio: 'Flores', dias: 4, coords: false, fotos: 1, desc: 'La dejé colgada en el respaldo de una silla.' },
  { t: 'Perdí mis auriculares con cable', cat: 'Electronica', barrio: 'Palermo', dias: 6, coords: false, fotos: 1, desc: 'Son unos Sony negros, con el cable medio pelado.' },
];

// Las cuatro de "Mis publicaciones", una por estado.
//
// La vencida se arma con estado ABIERTA y vence_en en el pasado, que es como
// vence de verdad: el backend calcula el estado efectivo con
// IF(estado='ABIERTA' AND vence_en<NOW(),'VENCIDA',estado). Poner
// estado='VENCIDA' a mano mostraria el badge pero no el mecanismo.
const MIAS = [
  { t: 'Encontré un paraguas azul en el subte', cat: 'Otros', barrio: 'Almagro', dias: 1, estado: 'ABIERTA', venceEnDias: 29, fotos: 1, desc: 'Quedó en el asiento de la línea A. Lo tengo guardado.' },
  { t: 'Encontré una campera de niño', cat: 'Ropa', barrio: 'Flores', dias: 5, estado: 'EN_RECLAMO', venceEnDias: 25, fotos: 1, desc: 'Talle 6, con dibujos de dinosaurios. Ya me escribió alguien.' },
  { t: 'Encontré un perro salchicha', cat: 'Mascotas', barrio: 'Caballito', dias: 20, estado: 'RESUELTA', venceEnDias: 10, fotos: 2, desc: 'Apareció la dueña y se lo llevó. Lo dejo publicado como referencia.' },
  { t: 'Perdí mi bufanda en el colectivo', cat: 'Ropa', barrio: 'Palermo', dias: 40, estado: 'ABIERTA', venceEnDias: -10, fotos: 0, desc: 'Ya pasaron los 30 días, esta quedó vencida.' },
  // Resuelta del otro lado: la persona PERDIO algo y un vecino se lo
  // devolvio. Es el caso de "Recupere" en el historial (punto 10).
  { t: 'Perdí mi billetera en el subte', cat: 'Documentos', barrio: 'Belgrano', dias: 6, estado: 'RESUELTA', venceEnDias: 24, fotos: 1, desc: 'Billetera marrón con el DNI y la SUBE. Ya apareció.' },
];

// Los reclamos y valoraciones de ejemplo (puntos 7 y 10). Cuelgan de las
// publicaciones de arriba y de las de los vecinos, asi que se borran solos
// con ellas.
//
// La respuesta a la pregunta de verificacion de todo lo sembrado es
// "Respuesta de ejemplo" (ver preguntaPara): sirve para probar "Es mio"
// a mano contra cualquier publicacion de los vecinos.
const RESPUESTA_NORMALIZADA = 'respuesta de ejemplo';

async function main() {
  const limpiar = process.argv.includes('--limpiar');
  const usuario = leerFlag('--usuario');

  await borrarLoSembrado(usuario);
  if (limpiar) {
    console.log('Listo: se borraron los datos de ejemplo de Hallado.');
    return;
  }

  const vecinos = await crearVecinos();
  let total = 0;

  const idsEncontradas = [];
  for (let i = 0; i < ENCONTRADAS.length; i++) {
    idsEncontradas.push(await crearPublicacion(ENCONTRADAS[i], 'ENCONTRE', vecinos[i % vecinos.length], i));
    total++;
  }
  for (let i = 0; i < PERDIDAS.length; i++) {
    await crearPublicacion(PERDIDAS[i], 'PERDI', vecinos[i % vecinos.length], i + 100);
    total++;
  }

  console.log(`${total} publicaciones de vecinos (${ENCONTRADAS.length} encontradas, ${PERDIDAS.length} perdidas).`);

  await sembrarCuentaPerfil(vecinos);
  console.log(`Cuenta del perfil: ${CUENTA_PERFIL.email} / ${PASSWORD_DEMO} con ${CASOS_PERFIL.length} casos resueltos.`);

  if (usuario) {
    const id = await idDeUsuario(usuario);
    if (!id) {
      console.log(`\nOJO: no existe la cuenta ${usuario}. Registrate en la app y volvé a correr esto.`);
    } else {
      const mias = {};
      for (let i = 0; i < MIAS.length; i++) {
        mias[MIAS[i].t] = await crearPublicacion(MIAS[i], MIAS[i].t.startsWith('Perdí') ? 'PERDI' : 'ENCONTRE', id, i + 200, MIAS[i]);
      }
      console.log(`${MIAS.length} publicaciones a nombre de ${usuario} (una por estado).`);

      await sembrarReclamos(id, mias, vecinos, idsEncontradas);
      console.log('Reclamos y valoraciones de ejemplo: 1 recibido pendiente, 1 enviado pendiente, 1 caso en "Devolví" (ya valorado) y 1 en "Recuperé" (sin valorar).');
    }
  } else {
    console.log('\nTip: pasale --usuario tu.email@gmail.com para sembrar tambien "Mis publicaciones".');
  }

  console.log('\nPara buscar: "Perdí algo" sin mas filtros devuelve 14 y pagina.');
  console.log('Para el estado sin resultados: "Perdí algo" + Ropa + Tigre.');
}

// ---------------------------------------------------------------- helpers

function leerFlag(nombre) {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function idPorNombre(tabla, nombre) {
  const [filas] = await pool.query(`SELECT id FROM ${tabla} WHERE nombre = ? LIMIT 1`, [nombre]);
  if (filas.length === 0) throw new Error(`No existe "${nombre}" en ${tabla}`);
  return filas[0].id;
}

async function idDeUsuario(email) {
  const [filas] = await pool.query('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [email.trim().toLowerCase()]);
  return filas.length ? filas[0].id : null;
}

// Borra lo sembrado antes: las de los vecinos demo (se van en cascada al
// borrar los usuarios) y, si se paso --usuario, las que tengan exactamente
// los titulos de MIAS. Por titulo y no por fecha para no llevarse puesta una
// publicacion que hayas cargado vos a mano probando.
async function borrarLoSembrado(usuario) {
  const emails = [...VECINOS.map((v) => v.email), CUENTA_PERFIL.email];
  await pool.query(
    `DELETE FROM usuarios WHERE email IN (${emails.map(() => '?').join(',')})`,
    emails
  );

  if (!usuario) return;
  const id = await idDeUsuario(usuario);
  if (!id) return;
  const titulos = MIAS.map((m) => m.t);
  await pool.query(
    `DELETE FROM hallado_publicaciones
      WHERE usuario_id = ? AND titulo IN (${titulos.map(() => '?').join(',')})`,
    [id, ...titulos]
  );
}

async function crearVecinos() {
  const hash = await bcrypt.hash(PASSWORD_DEMO, 10);
  const ids = [];
  for (const v of VECINOS) {
    const barrioId = await idPorNombre('zonas', v.barrio);
    const [res] = await pool.query(
      `INSERT INTO usuarios (email, password_hash, nombre, telefono, zona_id, telefono_visible, email_verificado)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [v.email, hash, v.nombre, v.telefono, barrioId, v.telefonoVisible ? 1 : 0]
    );
    ids.push(res.insertId);
  }
  return ids;
}

// La cuenta del punto 2 y sus casos resueltos (ver CASOS_PERFIL).
async function sembrarCuentaPerfil(vecinos) {
  const c = CUENTA_PERFIL;
  const [res] = await pool.query(
    `INSERT INTO usuarios
       (email, password_hash, nombre, telefono, zona_id, foto_url, telefono_visible, email_verificado, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, DATE_SUB(NOW(), INTERVAL ? DAY))`,
    [c.email, await bcrypt.hash(PASSWORD_DEMO, 10), c.nombre, c.telefono, await idPorNombre('zonas', c.barrio), c.foto, c.antiguedadDias]
  );
  const yo = res.insertId;

  for (let i = 0; i < CASOS_PERFIL.length; i++) {
    const caso = CASOS_PERFIL[i];
    const vecino = vecinos[caso.vecino];
    const publicoYo = caso.publica === 'yo';
    // Quien devuelve es el que encontro: si Martina devolvio y publico, la
    // publicacion es un ENCONTRE; si devolvio reclamando, era un PERDI ajeno.
    const tipoPublicacion = caso.devolvi === publicoYo ? 'ENCONTRE' : 'PERDI';

    const publicacionId = await crearPublicacion(
      { ...caso, dias: caso.dias + 1, fotos: 1 },
      tipoPublicacion,
      publicoYo ? yo : vecino,
      300 + i,
      { estado: 'RESUELTA', venceEnDias: DIAS_DE_VIGENCIA - caso.dias }
    );
    await pool.query(
      'UPDATE hallado_publicaciones SET resuelto_en = DATE_SUB(NOW(), INTERVAL ? DAY) WHERE id = ?',
      [caso.dias, publicacionId]
    );

    const reclamoId = await crearReclamo({
      publicacionId,
      reclamanteId: publicoYo ? vecino : yo,
      tipo: tipoPublicacion === 'ENCONTRE' ? 'ES_MIO' : 'LO_ENCONTRE',
      estado: 'ACEPTADO',
      diasRespondido: caso.dias,
      descripcion: tipoPublicacion === 'ENCONTRE' ? 'Es mío, lo reconozco por la foto.' : 'Lo encontré y lo tengo guardado.',
      barrio: tipoPublicacion === 'PERDI' ? caso.barrio : null,
      foto: `https://picsum.photos/seed/hallado-perfil-reclamo-${i}/800/600`,
    });
    await pool.query(
      'UPDATE hallado_reclamos SET creado_en = DATE_SUB(respondido_en, INTERVAL 1 DAY) WHERE id = ?',
      [reclamoId]
    );

    if (caso.valoracion) {
      await crearValoracion(reclamoId, vecino, yo, caso.dias, caso.valoracion);
    }
    if (caso.dias > 7) {
      await crearValoracion(reclamoId, yo, vecino, caso.dias, {
        tipo: 'POSITIVA',
        mensaje: null,
        agradecimiento: caso.devolvi ? null : 'Gracias por devolvérmelo.',
      });
    }
  }
}

async function crearValoracion(reclamoId, autorId, destinatarioId, diasDelCaso, { tipo, mensaje, agradecimiento }) {
  await pool.query(
    `INSERT INTO hallado_valoraciones (reclamo_id, autor_id, destinatario_id, tipo, mensaje, agradecimiento, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
    [reclamoId, autorId, destinatarioId, tipo, mensaje ?? null, agradecimiento ?? null, Math.max(diasDelCaso - 1, 0)]
  );
}

// Coordenadas del barrio con un corrimiento chico y determinista, para que
// las publicaciones no caigan todas en el mismo punto pero sigan adentro.
// ~0.001 grados son unos 100 metros.
async function coordenadasDe(barrioId, indice) {
  const [filas] = await pool.query('SELECT latitud, longitud FROM zonas WHERE id = ?', [barrioId]);
  const z = filas[0];
  return {
    lat: Number(z.latitud) + ((indice % 7) - 3) * 0.0015,
    lng: Number(z.longitud) + ((indice % 5) - 2) * 0.0015,
  };
}

async function crearPublicacion(dato, tipo, usuarioId, indice, opciones = {}) {
  const categoriaId = await idPorNombre('hallado_categorias', dato.cat);
  const barrioId = await idPorNombre('zonas', dato.barrio);

  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dato.dias);
  const fechaSuceso = fecha.toISOString().slice(0, 10);

  // Vence a los 30 dias del suceso, salvo que la fila pida otra cosa.
  const vence = new Date();
  vence.setDate(vence.getDate() + (opciones.venceEnDias ?? DIAS_DE_VIGENCIA - dato.dias));

  const punto = dato.coords === false ? { lat: null, lng: null } : await coordenadasDe(barrioId, indice);

  // La pregunta de verificacion es obligatoria solo para lo encontrado: es el
  // dato que no se ve en las fotos y sirve para validar al dueño (Punto 5).
  const verificacion =
    tipo === 'ENCONTRE'
      ? { pregunta: preguntaPara(dato.cat), respuesta: 'Respuesta de ejemplo' }
      : { pregunta: null, respuesta: null };

  const [res] = await pool.query(
    `INSERT INTO hallado_publicaciones
       (usuario_id, tipo, categoria_id, titulo, descripcion, fecha_suceso, franja_horaria,
        barrio_id, direccion, lat, lng, pregunta_verificacion, respuesta_verificacion,
        estado, vence_en)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      usuarioId, tipo, categoriaId, dato.t, dato.desc, fechaSuceso,
      ['MANANA', 'TARDE', 'NOCHE', 'NO_SE'][indice % 4],
      barrioId, punto.lat === null ? null : `Calle de ejemplo ${1000 + indice * 37}`,
      punto.lat, punto.lng,
      verificacion.pregunta, verificacion.respuesta,
      opciones.estado ?? 'ABIERTA', vence,
    ]
  );

  for (let i = 0; i < (dato.fotos ?? 0); i++) {
    await pool.query(
      'INSERT INTO hallado_fotos (publicacion_id, url, orden) VALUES (?, ?, ?)',
      [res.insertId, `https://picsum.photos/seed/hallado-${res.insertId}-${i}/800/600`, i]
    );
  }

  return res.insertId;
}

// Un reclamo con los campos que importan. Los demas quedan como los deja el
// backend cuando se crea desde la app.
async function crearReclamo({ publicacionId, reclamanteId, tipo, estado, diasRespondido, descripcion, barrio, foto }) {
  const barrioId = barrio ? await idPorNombre('zonas', barrio) : null;
  const esMio = tipo === 'ES_MIO';
  const [res] = await pool.query(
    `INSERT INTO hallado_reclamos
       (publicacion_id, reclamante_id, tipo, respuesta, respuesta_correcta, descripcion, foto_url,
        barrio_id, estado, vence_en, respondido_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 48 HOUR),
             ${diasRespondido === undefined ? 'NULL' : 'DATE_SUB(NOW(), INTERVAL ? DAY)'})`,
    [
      publicacionId, reclamanteId, tipo,
      esMio ? RESPUESTA_NORMALIZADA : null, esMio ? 1 : null,
      descripcion, foto ?? null, barrioId, estado,
      ...(diasRespondido === undefined ? [] : [diasRespondido]),
    ]
  );
  return res.insertId;
}

// Los cuatro reclamos que hacen falta para la demo de los puntos 7 y 10.
async function sembrarReclamos(usuarioId, mias, vecinos, idsEncontradas) {
  // 1. Recibido, pendiente: un vecino dice "Es mio" sobre la campera. Es la
  //    publicacion que esta EN_RECLAMO: sin un reclamo pendiente de verdad,
  //    el backend la devolveria a ABIERTA al primer vencimiento perezoso.
  await crearReclamo({
    publicacionId: mias['Encontré una campera de niño'],
    reclamanteId: vecinos[0],
    tipo: 'ES_MIO',
    estado: 'PENDIENTE',
    descripcion: 'Es la campera de mi hijo. Tiene el nombre bordado del lado de adentro.',
    foto: 'https://picsum.photos/seed/hallado-reclamo-campera/800/600',
  });

  // 2. Enviado, pendiente: la persona dice "Es mio" sobre el llavero del
  //    primer vecino, que pasa a EN_RECLAMO.
  await crearReclamo({
    publicacionId: idsEncontradas[0],
    reclamanteId: usuarioId,
    tipo: 'ES_MIO',
    estado: 'PENDIENTE',
    descripcion: 'El control de alarma es de un Gol Trend gris.',
  });
  await pool.query("UPDATE hallado_publicaciones SET estado = 'EN_RECLAMO' WHERE id = ?", [idsEncontradas[0]]);

  // 3. "Devolvi": el perro salchicha, aceptado hace 2 dias. La duena ya
  //    valoro y dejo un agradecimiento publico; la persona todavia puede
  //    valorarla (quedan 5 dias).
  const reclamoPerro = await crearReclamo({
    publicacionId: mias['Encontré un perro salchicha'],
    reclamanteId: vecinos[1],
    tipo: 'ES_MIO',
    estado: 'ACEPTADO',
    diasRespondido: 2,
    descripcion: 'Se llama Toto y responde al nombre. Tiene una mancha blanca en el pecho.',
    foto: 'https://picsum.photos/seed/hallado-reclamo-toto/800/600',
  });
  await pool.query(
    "UPDATE hallado_publicaciones SET resuelto_en = DATE_SUB(NOW(), INTERVAL 2 DAY) WHERE id = ?",
    [mias['Encontré un perro salchicha']]
  );
  await pool.query(
    `INSERT INTO hallado_valoraciones (reclamo_id, autor_id, destinatario_id, tipo, mensaje, agradecimiento)
     VALUES (?, ?, ?, 'POSITIVA', ?, ?)`,
    [
      reclamoPerro, vecinos[1], usuarioId,
      'Lo cuidó dos días y me lo trajo hasta casa.',
      'Gracias por cuidar a Toto como si fuera tuyo. Sos un vecino de oro.',
    ]
  );

  // 4. "Recupere": la billetera, que un vecino encontro y devolvio ayer.
  //    Nadie valoro todavia: es el caso para mostrar "Valorar" en la demo.
  await crearReclamo({
    publicacionId: mias['Perdí mi billetera en el subte'],
    reclamanteId: vecinos[2],
    tipo: 'LO_ENCONTRE',
    estado: 'ACEPTADO',
    diasRespondido: 1,
    descripcion: 'Estaba en el piso del andén. Tiene el DNI adentro, no la abrí más que para eso.',
    barrio: 'Belgrano',
    foto: 'https://picsum.photos/seed/hallado-reclamo-billetera/800/600',
  });
  await pool.query(
    "UPDATE hallado_publicaciones SET resuelto_en = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?",
    [mias['Perdí mi billetera en el subte']]
  );
}

function preguntaPara(categoria) {
  return {
    Llaves: '¿Cuántas llaves tiene el llavero?',
    Documentos: '¿A nombre de quién está?',
    Electronica: '¿Qué tiene de fondo de pantalla?',
    Mascotas: '¿Cómo se llama?',
    Ropa: '¿Qué tiene en los bolsillos?',
    Otros: '¿Alguna marca o detalle que no se vea en la foto?',
  }[categoria] ?? '¿Algún detalle que no se vea en la foto?';
}

main()
  .catch((e) => {
    console.error('Fallo el seed:', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

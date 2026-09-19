// Carga datos de ejemplo para poder probar el listado, los filtros y el
// perfil público sin tener que dar de alta todo a mano.
//
//   npm run db:seed
//
// Es idempotente: si los usuarios demo ya existen, borra sus publicaciones
// y las vuelve a crear, así siempre queda el mismo set conocido.
//
// NO se usa en la entrega final: son datos de prueba. Para vaciarlos:
//   npm run db:seed -- --limpiar
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

const PASSWORD_DEMO = 'demo1234';

const USUARIOS = [
  { email: 'sofia.demo@ronda.app', nombre: 'Sofía Ramírez', telefono: '11 4444-1111', zona: 'Palermo' },
  { email: 'martin.demo@ronda.app', nombre: 'Martín Sosa', telefono: '11 4444-2222', zona: 'Quilmes' },
  { email: 'carla.demo@ronda.app', nombre: 'Carla Benítez', telefono: '11 4444-3333', zona: 'Villa Urquiza' },
];

const PUBLICACIONES = [
  { v: 0, titulo: 'iPhone 12 64GB', descripcion: 'Impecable, batería 89%. Incluye caja y cargador original. Sin detalles en la pantalla.', cat: 'Celulares', precio: 320000, est: 'COMO_NUEVO', zona: 'Palermo', fotos: 3 },
  { v: 0, titulo: 'Notebook Lenovo IdeaPad', descripcion: 'Ryzen 5, 16GB de RAM, SSD 512GB. Ideal para estudiar o trabajar. Poco uso.', cat: 'Computación', precio: 540000, est: 'USADO', zona: 'Palermo', fotos: 2 },
  { v: 0, titulo: 'Bicicleta rodado 29', descripcion: 'Mountain bike aluminio, 21 velocidades. Recién service completo.', cat: 'Deportes', precio: 185000, est: 'USADO', zona: 'Palermo', fotos: 4 },
  { v: 1, titulo: 'PlayStation 5 Slim', descripcion: 'Sellada, sin abrir. Modelo con lectora. Garantía oficial.', cat: 'Consolas y videojuegos', precio: 890000, est: 'NUEVO', zona: 'Quilmes', fotos: 2 },
  { v: 1, titulo: 'Heladera Whirlpool no frost', descripcion: 'Funciona perfecto, la vendo por mudanza. 375 litros.', cat: 'Electrodomésticos', precio: 410000, est: 'USADO', zona: 'Quilmes', fotos: 3 },
  { v: 1, titulo: 'Taladro percutor Black+Decker', descripcion: 'Con maletín y set de mechas. Usado dos veces.', cat: 'Herramientas', precio: 65000, est: 'COMO_NUEVO', zona: 'Quilmes', fotos: 1 },
  { v: 2, titulo: 'Guitarra criolla La Alpujarra', descripcion: 'Modelo 300, tapa de cedro. Sonido muy dulce. Incluye funda.', cat: 'Instrumentos musicales', precio: 145000, est: 'USADO', zona: 'Villa Urquiza', fotos: 2 },
  { v: 2, titulo: 'Sillón de dos cuerpos', descripcion: 'Tapizado en chenille gris. Muy cómodo, sin manchas ni roturas.', cat: 'Hogar y muebles', precio: 230000, est: 'USADO', zona: 'Villa Urquiza', fotos: 3 },
  { v: 2, titulo: 'Cochecito Bebesit 3 en 1', descripcion: 'Incluye huevito y base para auto. Usado por un solo bebé.', cat: 'Bebés', precio: 120000, est: 'COMO_NUEVO', zona: 'Villa Urquiza', fotos: 2 },
  { v: 0, titulo: 'Colección Harry Potter', descripcion: 'Los 7 libros, tapa dura, edición Salamandra. En muy buen estado.', cat: 'Libros', precio: 85000, est: 'USADO', zona: 'Palermo', fotos: 1 },
  { v: 1, titulo: 'Campera de cuero talle M', descripcion: 'Cuero legítimo, color negro. Usada pocas veces.', cat: 'Indumentaria', precio: 95000, est: 'COMO_NUEVO', zona: 'Quilmes', fotos: 2 },
  { v: 2, titulo: 'Monitor Samsung 24" curvo', descripcion: 'Full HD, 75Hz. Sin píxeles muertos. Incluye cables.', cat: 'Computación', precio: 175000, est: 'USADO', zona: 'Villa Urquiza', fotos: 2 },
];

// Fotos de ejemplo. Cada publicación tiene su galería real de Unsplash, para
// que la demo se vea como una app de verdad y no con imágenes de relleno.
//
// La clave del diccionario es un fragmento del título: alcanza con que el
// título lo contenga. Si una publicación pide más fotos de las que hay
// cargadas, se repite la primera; y si el título no matchea ninguna clave,
// cae en picsum, así agregar una publicación nueva nunca rompe el seed.
const FOTOS_POR_PRODUCTO = {
  iPhone: [
    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1605236453806-6ff36851218e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1603798125914-7b5d27789248?auto=format&fit=crop&w=800&q=80',
  ],
  Notebook: [
    'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=800&q=80',
  ],
  Bicicleta: [
    'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?auto=format&fit=crop&w=800&q=80',
  ],
  PlayStation: [
    'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1607853202273-797f1c22a38e?auto=format&fit=crop&w=800&q=80',
  ],
  Heladera: [
    'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=800&q=80',
  ],
  Taladro: [
    'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80',
  ],
  Guitarra: [
    'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1550291652-6cb90046408b?auto=format&fit=crop&w=800&q=80',
  ],
  Sillón: [
    'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1540574163026-643ea20d25b5?auto=format&fit=crop&w=800&q=80',
  ],
  Cochecito: [
    'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=800&q=80',
  ],
  'Harry Potter': [
    'https://images.unsplash.com/photo-1622219809260-ce065361eb19?auto=format&fit=crop&w=800&q=80',
  ],
  Campera: [
    'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1520975954732-57dd22299614?auto=format&fit=crop&w=800&q=80',
  ],
  Monitor: [
    'https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1586210579191-33b45e38fa3c?auto=format&fit=crop&w=800&q=80',
  ],
};

function urlFoto(publicacion, indice, titulo) {
  for (const [clave, urls] of Object.entries(FOTOS_POR_PRODUCTO)) {
    if (titulo && titulo.includes(clave)) {
      return urls[indice] ?? urls[0];
    }
  }
  return `https://picsum.photos/seed/ronda-${publicacion}-${indice}/800/600`;
}

async function idPorNombre(tabla, nombre) {
  const [filas] = await pool.query(`SELECT id FROM ${tabla} WHERE nombre = ? LIMIT 1`, [nombre]);
  if (filas.length === 0) throw new Error(`No existe ${nombre} en ${tabla}`);
  return filas[0].id;
}

// Calles de ejemplo para el punto de entrega. Se reparten en orden entre las
// publicaciones, así cada una tiene una dirección distinta.
const CALLES = [
  'Av. Santa Fe', 'Av. Corrientes', 'Av. Cabildo', 'Av. Rivadavia',
  'Av. Callao', 'Av. Scalabrini Ortiz', 'Av. Juan B. Justo', 'Av. Triunvirato',
  'Av. Directorio', 'Av. Nazca', 'Av. Alvarez Thomas', 'Av. Warnes',
];

/**
 * Punto de entrega de una publicación (Puntos 4, 5 y 8).
 *
 * Las coordenadas salen de la zona con un desplazamiento chico y determinista,
 * para que los pines no caigan todos en el mismo lugar del mapa pero sigan
 * dentro del barrio. ~0.001 grados son unos 100 metros.
 */
async function puntoDeEntrega(zonaId, indice) {
  const [filas] = await pool.query('SELECT latitud, longitud FROM zonas WHERE id = ?', [zonaId]);
  const zona = filas[0];
  const calle = CALLES[indice % CALLES.length];
  const altura = 1000 + indice * 237; // cualquier número estable sirve

  return {
    direccion: `${calle} ${altura}`,
    latitud: Number(zona.latitud) + (indice % 5) * 0.001 - 0.002,
    longitud: Number(zona.longitud) + (indice % 3) * 0.001 - 0.001,
  };
}

async function limpiar() {
  const emails = USUARIOS.map((u) => u.email);
  const marcadores = emails.map(() => '?').join(', ');
  // El ON DELETE CASCADE de publicaciones se encarga de fotos y del resto.
  await pool.query(`DELETE FROM usuarios WHERE email IN (${marcadores})`, emails);
  console.log('  datos demo eliminados');
}

async function main() {
  const soloLimpiar = process.argv.includes('--limpiar');

  console.log('');
  if (soloLimpiar) {
    await limpiar();
    await pool.end();
    console.log('');
    return;
  }

  console.log('Cargando datos de demostración...');
  await limpiar();

  const passwordHash = await bcrypt.hash(PASSWORD_DEMO, 10);
  const idsUsuarios = [];

  for (const u of USUARIOS) {
    const zonaId = await idPorNombre('zonas', u.zona);
    const [res] = await pool.query(
      `INSERT INTO usuarios (email, password_hash, nombre, telefono, zona_id, email_verificado)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [u.email, passwordHash, u.nombre, u.telefono, zonaId]
    );
    idsUsuarios.push(res.insertId);
  }
  console.log(`  ${idsUsuarios.length} usuarios (contraseña: ${PASSWORD_DEMO})`);

  let totalFotos = 0;
  for (const [i, p] of PUBLICACIONES.entries()) {
    const categoriaId = await idPorNombre('categorias', p.cat);
    const zonaId = await idPorNombre('zonas', p.zona);
    const entrega = await puntoDeEntrega(zonaId, i);
    const [res] = await pool.query(
      `INSERT INTO publicaciones
         (vendedor_id, titulo, descripcion, categoria_id, precio, estado_articulo, zona_id,
          direccion, latitud, longitud, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [idsUsuarios[p.v], p.titulo, p.descripcion, categoriaId, p.precio, p.est, zonaId,
       entrega.direccion, entrega.latitud, entrega.longitud,
       PUBLICACIONES.length - i]
    );
    for (let k = 0; k < p.fotos; k++) {
      await pool.query(
        'INSERT INTO fotos_publicacion (publicacion_id, url, orden) VALUES (?, ?, ?)',
        [res.insertId, urlFoto(res.insertId, k, p.titulo), k]
      );
      totalFotos++;
    }
  }
  console.log(`  ${PUBLICACIONES.length} publicaciones con ${totalFotos} fotos`);

  // Un par de operaciones con calificaciones, para que la reputación no
  // aparezca vacía en el perfil público.
  const [op1] = await pool.query(
    'INSERT INTO operaciones (vendedor_id, comprador_id, monto) VALUES (?, ?, ?)',
    [idsUsuarios[0], idsUsuarios[1], 120000]
  );
  const [op2] = await pool.query(
    'INSERT INTO operaciones (vendedor_id, comprador_id, monto) VALUES (?, ?, ?)',
    [idsUsuarios[0], idsUsuarios[2], 55000]
  );
  await pool.query(
    `INSERT INTO calificaciones (operacion_id, calificador_id, calificado_id, rol_calificado, estrellas, comentario)
     VALUES (?, ?, ?, 'VENDEDOR', 5, 'Todo perfecto, muy buena onda'),
            (?, ?, ?, 'VENDEDOR', 4, 'Llegó bien, tardó un poco en responder')`,
    [op1.insertId, idsUsuarios[1], idsUsuarios[0],
     op2.insertId, idsUsuarios[2], idsUsuarios[0]]
  );
  console.log('  2 operaciones con sus calificaciones');

  await pool.end();
  console.log('');
  console.log('Listo. Probá:  GET http://localhost:3000/api/publicaciones');
  console.log('');
}

main().catch(async (error) => {
  console.error('Falló el seed:', error.message);
  await pool.end();
  process.exit(1);
});

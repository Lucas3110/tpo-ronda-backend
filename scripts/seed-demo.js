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

// Fotos de ejemplo: un servicio de imágenes de relleno, para no tener que
// subir archivos. Cada publicación usa una semilla distinta.
function urlFoto(publicacion, indice) {
  return `https://picsum.photos/seed/ronda-${publicacion}-${indice}/800/600`;
}

async function idPorNombre(tabla, nombre) {
  const [filas] = await pool.query(`SELECT id FROM ${tabla} WHERE nombre = ? LIMIT 1`, [nombre]);
  if (filas.length === 0) throw new Error(`No existe ${nombre} en ${tabla}`);
  return filas[0].id;
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
    const [res] = await pool.query(
      `INSERT INTO publicaciones
         (vendedor_id, titulo, descripcion, categoria_id, precio, estado_articulo, zona_id, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [idsUsuarios[p.v], p.titulo, p.descripcion, categoriaId, p.precio, p.est, zonaId,
       PUBLICACIONES.length - i]
    );
    for (let k = 0; k < p.fotos; k++) {
      await pool.query(
        'INSERT INTO fotos_publicacion (publicacion_id, url, orden) VALUES (?, ?, ?)',
        [res.insertId, urlFoto(res.insertId, k), k]
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

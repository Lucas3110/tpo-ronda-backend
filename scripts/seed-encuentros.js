// Reinicia únicamente las dos cuentas de demostración del punto 8.
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
const publicaciones = require('../src/services/halladoPublicarService');
const reclamos = require('../src/services/halladoReclamoService');

async function main() {
  const emails = ['devuelve.punto8@hallado.local', 'recupera.punto8@hallado.local'];
  await pool.query('DELETE FROM usuarios WHERE email IN (?)', [emails]);
  const hash = await bcrypt.hash('demo1234', 10);
  const ids = [];
  for (const [i, email] of emails.entries()) {
    const [alta] = await pool.query('INSERT INTO usuarios (email, nombre, password_hash, email_verificado) VALUES (?, ?, ?, 1)',
      [email, i === 0 ? 'Ana (devuelve)' : 'Bruno (recupera)', hash]);
    ids.push(alta.insertId);
  }
  const [[categoria]] = await pool.query('SELECT id FROM hallado_categorias ORDER BY id LIMIT 1');
  const [[barrio]] = await pool.query('SELECT id FROM zonas ORDER BY id LIMIT 1');
  const ahora = new Date();
  const fechaSuceso = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  for (const tipo of ['ENCONTRE', 'PERDI']) {
    const publicador = tipo === 'ENCONTRE' ? ids[0] : ids[1];
    const reclamante = tipo === 'ENCONTRE' ? ids[1] : ids[0];
    const { publicacion } = await publicaciones.crear(publicador, {
      tipo, titulo: tipo === 'ENCONTRE' ? 'Punto 8: encontré unas llaves' : 'Punto 8: perdí mi mochila',
      categoriaId: categoria.id, barrioId: barrio.id, fechaSuceso, franjaHoraria: 'TARDE', fotos: [],
      ...(tipo === 'ENCONTRE' ? { preguntaVerificacion: '¿De qué color es el llavero?', respuestaVerificacion: 'azul' } : {}),
    });
    const { reclamo } = await reclamos.crear(publicacion.id, reclamante, tipo === 'ENCONTRE'
      ? { respuesta: 'azul' }
      : { fotoUrl: 'https://picsum.photos/seed/hallado-punto8/400/400', barrioId: barrio.id, descripcion: 'Caso de demostración del punto 8' });
    await reclamos.aceptar(reclamo.id, publicador);
  }
  console.log('Dos casos aceptados, listos para coordinar. Menú > Mis reclamos > Punto de encuentro.');
  console.log('Ana: devuelve.punto8@hallado.local / demo1234');
  console.log('Bruno: recupera.punto8@hallado.local / demo1234');
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());

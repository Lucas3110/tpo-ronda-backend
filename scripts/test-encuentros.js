// Prueba HTTP real contra MySQL. Crea usuarios propios y los elimina al finalizar.
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
const app = require('../src/app');

async function main() {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  const usuarios = [];
  let comprobaciones = 0;
  async function pedir(metodo, ruta, usuario, body, esperado = 200) {
    const r = await fetch(base + ruta, { method: metodo, headers: {
      'Content-Type': 'application/json', ...(usuario ? { Authorization: `Bearer ${usuario.token}` } : {}),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await r.json();
    assert.equal(r.status, esperado, `${metodo} ${ruta}: ${JSON.stringify(data)}`);
    comprobaciones++;
    return data;
  }
  try {
    const hash = await bcrypt.hash('demo1234', 10);
    for (let i = 0; i < 3; i++) {
      const email = `encuentro-${Date.now()}-${i}@test.invalid`;
      const [alta] = await pool.query('INSERT INTO usuarios (email, nombre, password_hash, email_verificado) VALUES (?, ?, ?, 1)', [email, `Prueba ${i}`, hash]);
      usuarios.push({ id: alta.insertId });
      usuarios[i].token = (await pedir('POST', '/auth/login', null, { email, password: 'demo1234' })).token;
    }
    const [publicador, reclamante, tercero] = usuarios;
    const { categorias } = await pedir('GET', '/hallado/categorias');
    const { barrios } = await pedir('GET', '/hallado/barrios');
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    for (const tipo of ['ENCONTRE', 'PERDI']) {
      const { publicacion } = await pedir('POST', '/hallado/publicaciones', publicador, {
        tipo, titulo: `Prueba encuentro ${tipo}`, categoriaId: categorias[0].id, barrioId: barrios[0].id,
        fechaSuceso: fecha, franjaHoraria: 'NO_SE', fotos: [], direccion: 'Dirección original privada',
        ...(tipo === 'ENCONTRE' ? { preguntaVerificacion: '¿Color?', respuestaVerificacion: 'azul' } : {}),
      }, 201);
      const { reclamo } = await pedir('POST', `/hallado/publicaciones/${publicacion.id}/reclamos`, reclamante,
        tipo === 'ENCONTRE' ? { respuesta: 'azul' } : { fotoUrl: 'https://example.com/foto.jpg', barrioId: barrios[0].id }, 201);
      const ruta = `/hallado/reclamos/${reclamo.id}/encuentro`;
      await pedir('GET', ruta, publicador, undefined, 409);
      await pedir('POST', `${ruta}`, publicador, { direccion: 'Plaza Italia, CABA', version: 0 }, 409);
      await pedir('POST', `/hallado/reclamos/${reclamo.id}/aceptar`, publicador);
      await pedir('GET', ruta, undefined, undefined, 401);
      await pedir('GET', ruta, tercero, undefined, 403);
      for (const accion of ['', '/aceptar', '/concretar']) {
        await pedir('POST', ruta + accion, tercero, { direccion: 'Otro lugar', version: 0 }, 403);
      }
      const tiene = tipo === 'ENCONTRE' ? publicador : reclamante;
      const recupera = tipo === 'ENCONTRE' ? reclamante : publicador;
      const inicial = await pedir('GET', ruta, tiene);
      assert.equal(inicial.puedoProponer, true);
      assert.equal((await pedir('GET', ruta, recupera)).puedoProponer, false);
      await pedir('POST', ruta, recupera, { direccion: 'Plaza Italia, CABA', version: 0 }, 409);
      await pedir('POST', ruta + '/concretar', tiene, { version: 0 }, 409);
      await pedir('POST', `/hallado/reclamos/${reclamo.id}/valoracion`, tiene, { tipo: 'POSITIVA' }, 409);
      const antes = await pedir('GET', '/hallado/historial', tiene);
      assert(!antes.casos.some((c) => c.id === reclamo.id));
      const detalle = await pedir('GET', `/hallado/publicaciones/${publicacion.id}`, tercero);
      assert.equal(detalle.publicacion.estado, 'EN_RECLAMO');
      assert.equal(detalle.acciones.puedeReclamar, false);
      assert(!detalle.publicacion.direccion);
      await pedir('POST', `/hallado/publicaciones/${publicacion.id}/reclamos`, tercero,
        tipo === 'ENCONTRE' ? { respuesta: 'azul' } : { fotoUrl: 'https://example.com/foto.jpg', barrioId: barrios[0].id }, 409);
      for (const extra of [{ direccion: '' }, { direccion: 'x'.repeat(256) }, { lat: 91, lng: 0 }, { lat: 0 }, { lat: '', lng: '' }, { direccion: {} }]) {
        await pedir('POST', ruta, tiene, { direccion: 'Plaza Italia, CABA', version: 0, ...extra }, 400);
      }
      let estado = await pedir('POST', ruta, tiene, { direccion: 'Plaza Italia, CABA', lat: 0, lng: 0, version: 0 });
      assert.equal(estado.encuentro.lat, 0);
      await pedir('POST', ruta + '/aceptar', tiene, { version: 1 }, 409);
      estado = await pedir('POST', ruta, recupera, { direccion: 'Plaza de Mayo, CABA', version: 1 });
      assert.equal(estado.encuentro.version, 2);
      assert.equal(estado.encuentro.lat, null);
      await pedir('POST', ruta + '/aceptar', tiene, { version: 1 }, 409);
      // Dos operaciones sobre la misma propuesta: sólo una puede ganar.
      const resultados = await Promise.all(['aceptar', 'aceptar'].map(async (accion) => {
        const r = await fetch(base + ruta + '/' + accion, { method: 'POST', headers: {
          'Content-Type': 'application/json', Authorization: `Bearer ${tiene.token}`,
        }, body: JSON.stringify({ version: 2 }) });
        return r.status;
      }));
      assert.deepEqual(resultados.sort(), [200, 409]);
      comprobaciones += 2;
      estado = await pedir('GET', ruta, recupera);
      assert.equal(estado.encuentro.estado, 'ACEPTADO');
      await pedir('POST', ruta, tiene, { direccion: 'Otro lugar', version: 3 }, 409);
      estado = await pedir('POST', ruta + '/concretar', recupera, { version: 3 });
      assert.equal(estado.resuelto, true);
      await pedir('POST', ruta + '/concretar', tiene, { version: 4 }, 409);
      const historial = await pedir('GET', '/hallado/historial', recupera);
      const caso = historial.casos.find((c) => c.id === reclamo.id);
      assert(caso);
      assert.equal(caso.rol, 'RECUPERE');
      assert.equal(caso.valoracion.puedoValorar, true);
      const reputacion = (await pedir('GET', `/hallado/usuarios/${tiene.id}/perfil`)).perfil;
      assert(reputacion);
      await pedir('POST', `/hallado/reclamos/${reclamo.id}/valoracion`, recupera, { tipo: 'POSITIVA' }, 201);
      // El plazo se mide desde la entrega, aunque el reclamo se aceptó antes.
      await pool.query('UPDATE hallado_publicaciones SET resuelto_en = DATE_SUB(NOW(), INTERVAL 8 DAY) WHERE id = ?', [publicacion.id]);
      await pedir('POST', `/hallado/reclamos/${reclamo.id}/valoracion`, tiene, { tipo: 'POSITIVA' }, 409);
      console.log(`OK flujo ${tipo}: propuesta, alternativa, acuerdo, entrega, historial y plazo`);
    }
    console.log(`OK: ${comprobaciones} respuestas HTTP verificadas, más aserciones de estado y concurrencia.`);
  } finally {
    // Sólo borra los registros creados por esta ejecución.
    try {
      for (const usuario of usuarios) await pool.query('DELETE FROM usuarios WHERE id = ?', [usuario.id]);
    } finally {
      await new Promise((resolve) => servidor.close(resolve));
      await pool.end();
    }
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

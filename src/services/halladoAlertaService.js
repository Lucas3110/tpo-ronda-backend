// CAPA DE SERVICIO: punto 9 de Hallado, las alertas.
//
// "Cualquier búsqueda realizada desde el buscador puede guardarse como
// alerta, con todos sus criterios (tipo, categoría, barrio y palabras
// clave)." Una alerta es una búsqueda guardada que se vuelve a correr: los
// criterios se validan y se filtran con las mismas funciones que el
// buscador del punto 3, así una alerta encuentra exactamente lo mismo que
// la búsqueda de la que salió.
//
// "Nueva" quiere decir publicada después de la última vez que la persona
// miró la alerta: id mayor a visto_hasta_id (ver sql/17_hallado_alertas.sql
// por qué un id y no una fecha). Lo propio no cuenta: lo publicó ella misma.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toAlertaDto } = require('../dtos/halladoDto');
const buscador = require('./halladoBuscarService');

// Un tope para que una persona no junte cientos de alertas: cada una es una
// consulta más cada vez que se abre "Mis alertas".
const ALERTAS_MAXIMO = 20;

const SELECT_ALERTA = `
  SELECT a.*,
         c.nombre AS categoria_nombre,
         z.nombre AS barrio_nombre
    FROM hallado_alertas a
    LEFT JOIN hallado_categorias c ON c.id = a.categoria_id
    LEFT JOIN zonas z             ON z.id = a.barrio_id
`;

function validarId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de la alerta no es válido', 'ID_INVALIDO');
  }
  return id;
}

function criteriosDeFila(fila) {
  return {
    queTePaso: fila.que_te_paso,
    categoriaId: fila.categoria_id,
    barrioId: fila.barrio_id,
    q: fila.q,
  };
}

// El buscador no valida que la categoría o el barrio existan (con un id que
// no existe simplemente no encuentra nada). Acá sí hace falta: se guardan.
async function validarQueExistan({ categoriaId, barrioId }) {
  const [filas] = await pool.query(
    `SELECT
        (SELECT COUNT(*) FROM hallado_categorias WHERE id = ?) AS categoria,
        (SELECT COUNT(*) FROM zonas WHERE id = ?) AS barrio`,
    [categoriaId ?? 0, barrioId ?? 0]
  );
  if (categoriaId && Number(filas[0].categoria) === 0) {
    throw ApiError.badRequest('Esa categoría no existe', 'CATEGORIA_INVALIDA');
  }
  if (barrioId && Number(filas[0].barrio) === 0) {
    throw ApiError.badRequest('Ese barrio no existe', 'BARRIO_INVALIDO');
  }
}

async function buscarPropia(alertaId, usuarioId) {
  const id = validarId(alertaId);
  const [filas] = await pool.query(`${SELECT_ALERTA} WHERE a.id = ? LIMIT 1`, [id]);
  const alerta = filas[0];
  // 404 y no 403 cuando es de otra persona: las alertas son privadas, y no
  // hay por qué confirmar que ese id existe.
  if (!alerta || alerta.usuario_id !== usuarioId) {
    throw ApiError.notFound('Esa alerta no existe', 'ALERTA_NO_ENCONTRADA');
  }
  return alerta;
}

// Hasta dónde llegan las publicaciones hoy. Es lo que se guarda como
// visto_hasta_id al crear, reactivar o marcar como vista una alerta.
const ULTIMA_PUBLICACION = '(SELECT COALESCE(MAX(id), 0) FROM hallado_publicaciones)';

// Cuántas publicaciones coinciden con la alerta y aparecieron después de
// la última vez que se miró. Una pausada no cuenta: pausar es justamente no
// querer avisos.
async function contarNuevas(alerta) {
  if (!alerta.activa) return 0;
  const { condiciones, parametros } = buscador.condicionesDeCriterios(criteriosDeFila(alerta));
  condiciones.push('p.usuario_id <> ?', 'p.id > ?');
  parametros.push(alerta.usuario_id, alerta.visto_hasta_id);

  const [filas] = await pool.query(
    `SELECT COUNT(*) AS nuevas FROM hallado_publicaciones p WHERE ${condiciones.join(' AND ')}`,
    parametros
  );
  return Number(filas[0].nuevas);
}

// POST /api/hallado/alertas   { queTePaso, categoriaId?, barrioId?, q? }
//
// Lleva los mismos nombres que los filtros del buscador, así la app manda
// la búsqueda que tiene en pantalla tal cual. Lo que no es criterio de
// alerta (orden, fechas, coordenadas) se ignora.
//
// Guardar dos veces la misma búsqueda devuelve la que ya estaba en vez de
// duplicarla, por la misma razón que seguir es idempotente: un reintento
// del celular no tiene que dejar dos alertas iguales.
async function crear(usuarioId, datos = {}) {
  const criterios = buscador.validarCriterios(datos);
  await validarQueExistan(criterios);

  // <=> compara también los NULL: "sin categoría" es igual a "sin categoría".
  const [existentes] = await pool.query(
    `SELECT id FROM hallado_alertas
      WHERE usuario_id = ? AND que_te_paso = ?
        AND categoria_id <=> ? AND barrio_id <=> ? AND q <=> ?
      LIMIT 1`,
    [usuarioId, criterios.queTePaso, criterios.categoriaId, criterios.barrioId, criterios.q]
  );
  if (existentes.length > 0) {
    return { alerta: await alertaConNuevas(existentes[0].id, usuarioId), creada: false };
  }

  const [cantidad] = await pool.query(
    'SELECT COUNT(*) AS total FROM hallado_alertas WHERE usuario_id = ?',
    [usuarioId]
  );
  if (Number(cantidad[0].total) >= ALERTAS_MAXIMO) {
    throw ApiError.conflict(
      `Podés tener hasta ${ALERTAS_MAXIMO} alertas. Eliminá alguna para guardar otra`,
      'LIMITE_DE_ALERTAS'
    );
  }

  const [resultado] = await pool.query(
    `INSERT INTO hallado_alertas (usuario_id, que_te_paso, categoria_id, barrio_id, q, visto_hasta_id)
     VALUES (?, ?, ?, ?, ?, ${ULTIMA_PUBLICACION})`,
    [usuarioId, criterios.queTePaso, criterios.categoriaId, criterios.barrioId, criterios.q]
  );

  return { alerta: await alertaConNuevas(resultado.insertId, usuarioId), creada: true };
}

async function alertaConNuevas(alertaId, usuarioId) {
  const alerta = await buscarPropia(alertaId, usuarioId);
  return toAlertaDto(alerta, await contarNuevas(alerta));
}

// GET /api/hallado/alertas — "Mis alertas", cada una con sus nuevas.
async function listar(usuarioId) {
  const [filas] = await pool.query(
    `${SELECT_ALERTA} WHERE a.usuario_id = ? ORDER BY a.creado_en DESC, a.id DESC`,
    [usuarioId]
  );
  // Un conteo por alerta, en paralelo. Con el tope de 20 no vale la pena
  // armar una sola consulta gigante.
  const nuevas = await Promise.all(filas.map(contarNuevas));
  const alertas = filas.map((fila, i) => toAlertaDto(fila, nuevas[i]));

  return {
    alertas,
    totalNuevas: nuevas.reduce((suma, n) => suma + n, 0),
  };
}

// PATCH /api/hallado/alertas/:id   { activa }
//
// Al reactivar, lo visto arranca de cero: lo que apareció mientras estaba
// pausada es justo lo que la persona pidió no escuchar, y si se contara
// todo junto el indicador se prendería de golpe con cosas viejas.
async function cambiarEstado(alertaId, usuarioId, datos = {}) {
  const alerta = await buscarPropia(alertaId, usuarioId);
  if (typeof datos.activa !== 'boolean') {
    throw ApiError.badRequest('activa tiene que ser true o false', 'ACTIVA_INVALIDA');
  }

  if (datos.activa && !alerta.activa) {
    await pool.query(
      `UPDATE hallado_alertas SET activa = 1, visto_hasta_id = ${ULTIMA_PUBLICACION}, visto_en = NOW()
        WHERE id = ?`,
      [alerta.id]
    );
  } else if (!datos.activa && alerta.activa) {
    await pool.query('UPDATE hallado_alertas SET activa = 0 WHERE id = ?', [alerta.id]);
  }

  return { alerta: await alertaConNuevas(alerta.id, usuarioId) };
}

// DELETE /api/hallado/alertas/:id
async function eliminar(alertaId, usuarioId) {
  const alerta = await buscarPropia(alertaId, usuarioId);
  await pool.query('DELETE FROM hallado_alertas WHERE id = ?', [alerta.id]);
  return { mensaje: 'Alerta eliminada' };
}

// GET /api/hallado/alertas/:id/publicaciones?pagina=&limite=
//
// Lo que encuentra la alerta, con el mismo formato y paginado que el
// buscador, más esNueva en cada publicación. Mirar NO marca como visto: si
// lo hiciera, la página 2 llegaría con todo ya marcado. Para eso está
// POST /alertas/:id/vista.
async function publicaciones(alertaId, usuarioId, consulta = {}) {
  const alerta = await buscarPropia(alertaId, usuarioId);
  const resultado = await buscador.buscar(
    { ...criteriosDeFila(alerta), pagina: consulta.pagina, limite: consulta.limite },
    { excluirUsuarioId: usuarioId }
  );

  return {
    alerta: toAlertaDto(alerta, await contarNuevas(alerta)),
    publicaciones: resultado.publicaciones.map((p) => ({
      ...p,
      esNueva: Boolean(alerta.activa) && p.id > alerta.visto_hasta_id,
    })),
    paginado: resultado.paginado,
  };
}

// POST /api/hallado/alertas/:id/vista — apaga el indicador de la alerta.
async function marcarVista(alertaId, usuarioId) {
  const alerta = await buscarPropia(alertaId, usuarioId);
  await pool.query(
    `UPDATE hallado_alertas SET visto_hasta_id = ${ULTIMA_PUBLICACION}, visto_en = NOW() WHERE id = ?`,
    [alerta.id]
  );
  return { alerta: await alertaConNuevas(alerta.id, usuarioId) };
}

// Para el indicador general (GET /novedades): cuántas alertas tienen algo
// nuevo y cuántas publicaciones nuevas suman entre todas.
async function resumenDeNovedades(usuarioId) {
  const [filas] = await pool.query(
    'SELECT * FROM hallado_alertas WHERE usuario_id = ? AND activa = 1',
    [usuarioId]
  );
  const nuevas = await Promise.all(filas.map(contarNuevas));
  return {
    publicacionesNuevas: nuevas.reduce((suma, n) => suma + n, 0),
    alertasConNovedad: nuevas.filter((n) => n > 0).length,
  };
}

module.exports = {
  crear,
  listar,
  cambiarEstado,
  eliminar,
  publicaciones,
  marcarVista,
  resumenDeNovedades,
};

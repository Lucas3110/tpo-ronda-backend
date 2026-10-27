// CAPA DE SERVICIO: punto 10 de Hallado, valoraciones y agradecimientos.
//
// "Dentro de los 7 días posteriores a la devolución, cada parte puede
// valorar a la otra (positiva o negativa) y dejar un mensaje breve
// opcional. Quien recuperó su objeto puede además dejar un agradecimiento
// público, visible en el perfil de quien se lo devolvió."
//
// La devolución es la aceptación del reclamo (punto 7): desde esa fecha
// corren los 7 días. Son configurables con VALORACION_PLAZO_DIAS para poder
// mostrar el plazo vencido en una demo sin esperar una semana.
const { pool } = require('../config/db');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { toValoracionDto, toAgradecimientoDto } = require('../dtos/halladoDto');
const { buscarReclamo } = require('./halladoReclamoService');

const TIPOS = ['POSITIVA', 'NEGATIVA'];
const MENSAJE_MAX = 300;
const AGRADECIMIENTO_MAX = 500;

const SELECT_VALORACION = `
  SELECT v.*,
         ua.nombre AS autor_nombre,
         ud.nombre AS destinatario_nombre,
         r.publicacion_id,
         p.titulo AS pub_titulo
    FROM hallado_valoraciones v
    JOIN usuarios ua ON ua.id = v.autor_id
    JOIN usuarios ud ON ud.id = v.destinatario_id
    JOIN hallado_reclamos r ON r.id = v.reclamo_id
    JOIN hallado_publicaciones p ON p.id = r.publicacion_id
`;

function validarId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id no es válido', 'ID_INVALIDO');
  }
  return id;
}

function validarTipo(valor) {
  const tipo = String(valor ?? '').trim().toUpperCase();
  if (!TIPOS.includes(tipo)) {
    throw ApiError.badRequest(`La valoración debe ser una de: ${TIPOS.join(', ')}`, 'TIPO_INVALIDO');
  }
  return tipo;
}

function validarTexto(valor, { campo, codigo, max }) {
  const limpio = String(valor ?? '').trim();
  if (limpio === '') return null;
  if (limpio.length > max) {
    throw ApiError.badRequest(`${campo} no puede tener más de ${max} caracteres`, `${codigo}_LARGO`);
  }
  return limpio;
}

// Quién recuperó en un caso: el publicador si la publicación era de algo
// PERDIDO, o quien reclamó "Es mío" si era de algo ENCONTRADO.
function recuperoEn(reclamo, usuarioId) {
  if (reclamo.tipo === 'LO_ENCONTRE') return reclamo.publicador_id === usuarioId;
  return reclamo.reclamante_id === usuarioId;
}

// Las valoraciones de un conjunto de casos, agrupadas por reclamo. Lo usa
// el historial para mostrar la propia y la recibida en cada caso.
async function valoracionesDe(reclamoIds) {
  if (reclamoIds.length === 0) return new Map();
  const [filas] = await pool.query(`${SELECT_VALORACION} WHERE v.reclamo_id IN (?)`, [reclamoIds]);
  const porReclamo = new Map();
  for (const fila of filas) {
    if (!porReclamo.has(fila.reclamo_id)) porReclamo.set(fila.reclamo_id, []);
    porReclamo.get(fila.reclamo_id).push(fila);
  }
  return porReclamo;
}

// POST /api/hallado/reclamos/:id/valoracion   { tipo, mensaje?, agradecimiento? }
async function valorar(reclamoId, usuarioId, datos = {}) {
  const id = validarId(reclamoId);
  const reclamo = await buscarReclamo(id);

  if (reclamo.reclamante_id !== usuarioId && reclamo.publicador_id !== usuarioId) {
    throw ApiError.forbidden('Ese caso no es tuyo', 'NO_TE_CORRESPONDE');
  }
  if (reclamo.estado !== 'ACEPTADO') {
    throw ApiError.conflict('Todavía no hay una devolución que valorar', 'CASO_NO_RESUELTO');
  }
  if (Number(reclamo.dias_desde_respuesta) > config.valoracion.plazoDias) {
    throw ApiError.conflict(
      `Las valoraciones se dejan dentro de los ${config.valoracion.plazoDias} días de la devolución`,
      'PLAZO_VENCIDO'
    );
  }

  const tipo = validarTipo(datos.tipo);
  const mensaje = validarTexto(datos.mensaje, { campo: 'El mensaje', codigo: 'MENSAJE', max: MENSAJE_MAX });
  const agradecimiento = validarTexto(datos.agradecimiento, {
    campo: 'El agradecimiento', codigo: 'AGRADECIMIENTO', max: AGRADECIMIENTO_MAX,
  });

  if (agradecimiento !== null && !recuperoEn(reclamo, usuarioId)) {
    throw ApiError.badRequest(
      'El agradecimiento lo deja quien recuperó su objeto',
      'AGRADECIMIENTO_NO_CORRESPONDE'
    );
  }

  const [previas] = await pool.query(
    'SELECT id FROM hallado_valoraciones WHERE reclamo_id = ? AND autor_id = ? LIMIT 1',
    [id, usuarioId]
  );
  if (previas.length > 0) {
    throw ApiError.conflict('Ya valoraste este caso', 'YA_VALORASTE');
  }

  const destinatarioId = reclamo.reclamante_id === usuarioId ? reclamo.publicador_id : reclamo.reclamante_id;

  const [resultado] = await pool.query(
    `INSERT INTO hallado_valoraciones (reclamo_id, autor_id, destinatario_id, tipo, mensaje, agradecimiento)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, usuarioId, destinatarioId, tipo, mensaje, agradecimiento]
  );

  const [filas] = await pool.query(`${SELECT_VALORACION} WHERE v.id = ? LIMIT 1`, [resultado.insertId]);
  return { valoracion: toValoracionDto(filas[0]) };
}

// GET /api/hallado/usuarios/:id/agradecimientos
// Público: es lo que se ve en el perfil de quien devolvió (punto 2).
async function listarAgradecimientos(usuarioId) {
  const id = validarId(usuarioId);
  const [usuarios] = await pool.query('SELECT id FROM usuarios WHERE id = ? LIMIT 1', [id]);
  if (usuarios.length === 0) {
    throw ApiError.notFound('Usuario no encontrado', 'USUARIO_NO_ENCONTRADO');
  }

  const [filas] = await pool.query(
    `${SELECT_VALORACION}
      WHERE v.destinatario_id = ? AND v.agradecimiento IS NOT NULL
      ORDER BY v.creado_en DESC`,
    [id]
  );
  return { agradecimientos: filas.map(toAgradecimientoDto) };
}

module.exports = { valorar, listarAgradecimientos, valoracionesDe, recuperoEn };

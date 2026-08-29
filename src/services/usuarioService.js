// Punto 2: perfil, datos personales y reputación.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const {
  toUsuarioDto,
  toPerfilPublicoDto,
  toReputacionDto,
  toZonaListadoDto,
} = require('../dtos/usuarioDto');
const { publicacionesActivasDe } = require('./publicacionService');

const NOMBRE_MAX = 30;
const TELEFONO_MAX = 30;
const FORMATO_NOMBRE = /^\p{L}[\p{L} '’-]*$/u;
// Dígitos, espacios, guiones, paréntesis y un + inicial opcional.
const FORMATO_TELEFONO = /^\+?[\d\s()-]{6,}$/;

// Trae al usuario junto con el nombre de su zona, para armar el DTO de una.
const SELECT_USUARIO = `
  SELECT u.*, z.nombre AS zona_nombre
    FROM usuarios u
    LEFT JOIN zonas z ON z.id = u.zona_id
`;

async function buscarUsuarioConZona(id) {
  const [filas] = await pool.query(`${SELECT_USUARIO} WHERE u.id = ? LIMIT 1`, [id]);
  return filas[0] || null;
}

/**
 * Reputación de una persona: promedio de estrellas recibidas y cuántas
 * operaciones concretó de cada lado.
 *
 * Son tres consultas distintas metidas en una sola con subqueries, para no
 * pegarle tres veces a la base por cada perfil que se muestra.
 */
async function obtenerReputacion(usuarioId) {
  const [filas] = await pool.query(
    `SELECT
        (SELECT AVG(estrellas) FROM calificaciones WHERE calificado_id = ?)  AS promedio_estrellas,
        (SELECT COUNT(*)       FROM calificaciones WHERE calificado_id = ?)  AS cantidad_calificaciones,
        (SELECT COUNT(*)       FROM operaciones    WHERE vendedor_id  = ?)   AS operaciones_vendedor,
        (SELECT COUNT(*)       FROM operaciones    WHERE comprador_id = ?)   AS operaciones_comprador`,
    [usuarioId, usuarioId, usuarioId, usuarioId]
  );
  return filas[0];
}

// ---------------------------------------------------------------
// Validaciones de los datos personales
// ---------------------------------------------------------------
function validarNombre(nombre) {
  const limpio = String(nombre ?? '').trim();

  if (limpio === '') {
    throw ApiError.badRequest('El nombre es obligatorio', 'NOMBRE_REQUERIDO');
  }
  if (limpio.length > NOMBRE_MAX) {
    throw ApiError.badRequest(
      `El nombre no puede tener más de ${NOMBRE_MAX} caracteres`,
      'NOMBRE_LARGO'
    );
  }
  if (/\d/.test(limpio)) {
    throw ApiError.badRequest('El nombre no puede contener números', 'NOMBRE_CON_NUMEROS');
  }
  if (!FORMATO_NOMBRE.test(limpio)) {
    throw ApiError.badRequest(
      'El nombre sólo puede tener letras, espacios, apóstrofos y guiones',
      'NOMBRE_INVALIDO'
    );
  }
  return limpio;
}

/** El teléfono es opcional: si no lo mandan, queda en NULL. */
function validarTelefono(telefono) {
  if (telefono === undefined || telefono === null) return null;

  const limpio = String(telefono).trim();
  if (limpio === '') return null;

  if (limpio.length > TELEFONO_MAX) {
    throw ApiError.badRequest(
      `El teléfono no puede tener más de ${TELEFONO_MAX} caracteres`,
      'TELEFONO_LARGO'
    );
  }
  if (!FORMATO_TELEFONO.test(limpio)) {
    throw ApiError.badRequest(
      'El teléfono sólo puede tener números, espacios, guiones y paréntesis',
      'TELEFONO_INVALIDO'
    );
  }
  return limpio;
}

/** La zona también es opcional, pero si viene tiene que existir. */
async function validarZona(zonaId) {
  if (zonaId === undefined || zonaId === null || zonaId === '') return null;

  const id = Number(zonaId);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('La zona no es válida', 'ZONA_INVALIDA');
  }

  const [filas] = await pool.query('SELECT id FROM zonas WHERE id = ? LIMIT 1', [id]);
  if (filas.length === 0) {
    throw ApiError.badRequest('La zona no existe', 'ZONA_INEXISTENTE');
  }
  return id;
}

// ---------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------

// GET /api/usuarios/me
async function obtenerDatosPersonales(usuarioId) {
  const usuario = await buscarUsuarioConZona(usuarioId);
  if (!usuario) {
    throw ApiError.notFound('Usuario no encontrado', 'USUARIO_NO_ENCONTRADO');
  }
  return { usuario: toUsuarioDto(usuario) };
}

// PUT /api/usuarios/me
// El email no se puede cambiar acá: cambiarlo obligaría a verificarlo de
// nuevo con un OTP, así que sería otro caso de uso.
async function actualizarDatosPersonales(usuarioId, { nombre, telefono, zonaId }) {
  const nombreLimpio = validarNombre(nombre);
  const telefonoLimpio = validarTelefono(telefono);
  const zona = await validarZona(zonaId);

  await pool.query(
    'UPDATE usuarios SET nombre = ?, telefono = ?, zona_id = ? WHERE id = ?',
    [nombreLimpio, telefonoLimpio, zona, usuarioId]
  );

  const usuario = await buscarUsuarioConZona(usuarioId);
  return {
    mensaje: 'Datos actualizados',
    usuario: toUsuarioDto(usuario),
  };
}

// GET /api/usuarios/:id/perfil
// Perfil público: lo consulta cualquiera antes de operar con esa persona.
async function obtenerPerfilPublico(usuarioId) {
  const id = Number(usuarioId);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de usuario no es válido', 'ID_INVALIDO');
  }

  const [filas] = await pool.query(
    `SELECT u.*,
            z.nombre AS zona_nombre,
            DATEDIFF(NOW(), u.creado_en) AS antiguedad_dias
       FROM usuarios u
       LEFT JOIN zonas z ON z.id = u.zona_id
      WHERE u.id = ?
      LIMIT 1`,
    [id]
  );
  const usuario = filas[0];
  if (!usuario) {
    throw ApiError.notFound('Usuario no encontrado', 'USUARIO_NO_ENCONTRADO');
  }

  // Reputación y publicaciones no dependen una de la otra, así que van
  // en paralelo: el perfil tarda lo que tarda la más lenta, no la suma.
  const [reputacion, publicaciones] = await Promise.all([
    obtenerReputacion(id),
    publicacionesActivasDe(id),
  ]);

  return { perfil: toPerfilPublicoDto(usuario, reputacion, publicaciones) };
}

// GET /api/usuarios/:id/reputacion
async function obtenerReputacionPublica(usuarioId) {
  const id = Number(usuarioId);
  const [filas] = await pool.query('SELECT id FROM usuarios WHERE id = ? LIMIT 1', [id]);
  if (filas.length === 0) {
    throw ApiError.notFound('Usuario no encontrado', 'USUARIO_NO_ENCONTRADO');
  }
  return { reputacion: toReputacionDto(await obtenerReputacion(id)) };
}

// GET /api/zonas
async function listarZonas() {
  const [filas] = await pool.query('SELECT * FROM zonas ORDER BY nombre');
  return { zonas: filas.map(toZonaListadoDto) };
}

module.exports = {
  obtenerDatosPersonales,
  actualizarDatosPersonales,
  obtenerPerfilPublico,
  obtenerReputacionPublica,
  listarZonas,
  obtenerReputacion,
  buscarUsuarioConZona,
};

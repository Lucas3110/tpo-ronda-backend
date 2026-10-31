// CAPA DE SERVICIO: punto 2 de Hallado, el perfil público.
//
// "El perfil público muestra la reputación, las insignias y la antigüedad
// en la plataforma, pero no el teléfono ni el historial de publicaciones."
//
// Es distinto del de /usuarios/:id/perfil, que es el de Ronda: aquel
// calcula la reputación con estrellas de compra-venta y lista las
// publicaciones activas, que acá el enunciado pide explícitamente no mostrar.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toPerfilPublicoDto } = require('../dtos/halladoDto');
const { obtenerReputacion, calcularInsignias } = require('./halladoReputacionService');

function validarId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de usuario no es válido', 'ID_INVALIDO');
  }
  return id;
}

// GET /api/hallado/usuarios/:id/perfil
async function obtenerPerfilPublico(usuarioId) {
  const id = validarId(usuarioId);

  const [filas] = await pool.query(
    `SELECT id, nombre, foto_url, creado_en,
            DATEDIFF(NOW(), creado_en) AS antiguedad_dias
       FROM usuarios
      WHERE id = ?
      LIMIT 1`,
    [id]
  );
  const usuario = filas[0];
  if (!usuario) {
    throw ApiError.notFound('Usuario no encontrado', 'USUARIO_NO_ENCONTRADO');
  }

  const reputacion = await obtenerReputacion(id);
  return {
    perfil: toPerfilPublicoDto(usuario, reputacion, calcularInsignias(reputacion)),
  };
}

module.exports = { obtenerPerfilPublico };

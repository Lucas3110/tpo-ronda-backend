// Punto 3: listado, buscador y filtros.
const publicacionService = require('../services/publicacionService');

async function listar(req, res) {
  // req.usuario puede ser null: el listado es público. Sólo se usa para
  // poder ordenar por cercanía a la zona de quien mira.
  const usuarioId = req.usuario ? req.usuario.id : null;
  res.status(200).json(await publicacionService.listar(req.query, usuarioId));
}

async function categorias(req, res) {
  res.status(200).json(await publicacionService.listarCategorias());
}

module.exports = { listar, categorias };

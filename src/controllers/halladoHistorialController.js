// CAPA DE CONTROLLER del punto 10 de Hallado: sólo traduce HTTP.
const historial = require('../services/halladoHistorialService');

// GET /api/hallado/historial?tipo=&desde=&hasta=
async function listar(req, res) {
  const dto = await historial.listar(req.usuario.id, req.query);
  res.status(200).json(dto);
}

module.exports = { listar };

// CAPA DE CONTROLLER del punto 10 de Hallado (valoraciones): sólo traduce HTTP.
const servicio = require('../services/halladoValoracionService');

// POST /api/hallado/reclamos/:id/valoracion   { tipo, mensaje?, agradecimiento? }
async function valorar(req, res) {
  const dto = await servicio.valorar(req.params.id, req.usuario.id, req.body);
  res.status(201).json(dto);
}

// GET /api/hallado/usuarios/:id/agradecimientos
async function agradecimientos(req, res) {
  const dto = await servicio.listarAgradecimientos(req.params.id);
  res.status(200).json(dto);
}

module.exports = { valorar, agradecimientos };

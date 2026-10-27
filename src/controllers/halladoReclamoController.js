// CAPA DE CONTROLLER del punto 7 de Hallado: sólo traduce HTTP.
// Lee lo que vino en el request, llama al service y devuelve el DTO.
const servicio = require('../services/halladoReclamoService');

// POST /api/hallado/publicaciones/:id/reclamos
// "Es mío" en una publicación de algo encontrado, "Lo encontré" en una de
// algo perdido. Cuál de las dos lo decide el service por el tipo.
async function crear(req, res) {
  const dto = await servicio.crear(req.params.id, req.usuario.id, req.body);
  res.status(201).json(dto);
}

// POST /api/hallado/reclamos/:id/aceptar
async function aceptar(req, res) {
  const dto = await servicio.aceptar(req.params.id, req.usuario.id);
  res.status(200).json(dto);
}

// POST /api/hallado/reclamos/:id/rechazar   { motivo? }
async function rechazar(req, res) {
  const dto = await servicio.rechazar(req.params.id, req.usuario.id, req.body);
  res.status(200).json(dto);
}

// GET /api/hallado/reclamos/mios
async function mios(req, res) {
  const dto = await servicio.listarMios(req.usuario.id);
  res.status(200).json(dto);
}

// GET /api/hallado/reclamos/:id
async function obtener(req, res) {
  const dto = await servicio.obtener(req.params.id, req.usuario.id);
  res.status(200).json(dto);
}

module.exports = { crear, aceptar, rechazar, mios, obtener };

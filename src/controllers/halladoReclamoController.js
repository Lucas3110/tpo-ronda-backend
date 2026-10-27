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

module.exports = { crear };

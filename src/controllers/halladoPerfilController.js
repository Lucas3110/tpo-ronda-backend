// CAPA DE CONTROLLER del punto 2 de Hallado (perfil público): sólo traduce HTTP.
const servicio = require('../services/halladoPerfilService');

// GET /api/hallado/usuarios/:id/perfil
async function perfilPublico(req, res) {
  const dto = await servicio.obtenerPerfilPublico(req.params.id);
  res.status(200).json(dto);
}

module.exports = { perfilPublico };

// CAPA DE CONTROLLER del punto 9 de Hallado (alertas, seguidas y el
// indicador de novedad): sólo traduce HTTP.
const alertas = require('../services/halladoAlertaService');
const seguimiento = require('../services/halladoSeguirService');
const novedades = require('../services/halladoNovedadService');

// POST /api/hallado/alertas   { queTePaso, categoriaId?, barrioId?, q? }
// 201 si se creó, 200 si esa misma búsqueda ya estaba guardada.
async function crear(req, res) {
  const { alerta, creada } = await alertas.crear(req.usuario.id, req.body);
  res.status(creada ? 201 : 200).json({ alerta, creada });
}

// GET /api/hallado/alertas
async function listar(req, res) {
  res.status(200).json(await alertas.listar(req.usuario.id));
}

// PATCH /api/hallado/alertas/:id   { activa }
async function cambiarEstado(req, res) {
  const dto = await alertas.cambiarEstado(req.params.id, req.usuario.id, req.body);
  res.status(200).json(dto);
}

// DELETE /api/hallado/alertas/:id
async function eliminar(req, res) {
  const dto = await alertas.eliminar(req.params.id, req.usuario.id);
  res.status(200).json(dto);
}

// GET /api/hallado/alertas/:id/publicaciones?pagina=&limite=
async function publicaciones(req, res) {
  const dto = await alertas.publicaciones(req.params.id, req.usuario.id, req.query);
  res.status(200).json(dto);
}

// POST /api/hallado/alertas/:id/vista
async function marcarVista(req, res) {
  const dto = await alertas.marcarVista(req.params.id, req.usuario.id);
  res.status(200).json(dto);
}

// GET /api/hallado/seguidas
async function seguidas(req, res) {
  res.status(200).json(await seguimiento.listarSeguidas(req.usuario.id));
}

// GET /api/hallado/novedades
async function resumenNovedades(req, res) {
  res.status(200).json(await novedades.resumen(req.usuario.id));
}

module.exports = {
  crear,
  listar,
  cambiarEstado,
  eliminar,
  publicaciones,
  marcarVista,
  seguidas,
  resumenNovedades,
};

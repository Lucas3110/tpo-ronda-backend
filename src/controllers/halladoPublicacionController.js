// CAPA DE CONTROLLER: sólo traduce HTTP.
// Lee lo que vino en el request, llama al service y devuelve el DTO.
// Nunca escribe SQL ni reglas de negocio acá.
//
// Express 5 captura las promesas rechazadas de estos handlers y se las pasa
// al middleware de errores, así que no hace falta try/catch.
const servicio = require('../services/halladoPublicarService');
const fotos = require('../services/halladoFotoService');

async function categorias(req, res) {
  res.status(200).json(await servicio.listarCategorias());
}

async function barrios(req, res) {
  res.status(200).json(await servicio.listarBarrios());
}

// POST /api/hallado/fotos
// La app manda { base64, mime } y recibe { url }. Esa url es la que despues
// va en el campo fotos de la publicacion.
async function subirFoto(req, res) {
  const dto = await fotos.subir(req.usuario.id, req.body);
  res.status(201).json(dto);
}

async function crear(req, res) {
  const dto = await servicio.crear(req.usuario.id, req.body);
  res.status(201).json(dto);
}

async function editar(req, res) {
  const dto = await servicio.editar(Number(req.params.id), req.usuario.id, req.body);
  res.status(200).json(dto);
}

async function mias(req, res) {
  const dto = await servicio.listarMias(req.usuario.id, { estado: req.query.estado });
  res.status(200).json(dto);
}

async function obtenerPropia(req, res) {
  const dto = await servicio.obtenerPropia(Number(req.params.id), req.usuario.id);
  res.status(200).json(dto);
}

async function renovar(req, res) {
  const dto = await servicio.renovar(Number(req.params.id), req.usuario.id);
  res.status(200).json(dto);
}

async function eliminar(req, res) {
  const dto = await servicio.eliminar(Number(req.params.id), req.usuario.id);
  res.status(200).json(dto);
}

module.exports = {
  categorias,
  subirFoto,
  barrios,
  crear,
  editar,
  mias,
  obtenerPropia,
  renovar,
  eliminar,
};

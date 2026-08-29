// Punto 5: alta y gestión de las publicaciones propias.
const publicarService = require('../services/publicarService');

async function crear(req, res) {
  res.status(201).json(await publicarService.crear(req.usuario.id, req.body));
}

async function editar(req, res) {
  res.status(200).json(await publicarService.editar(req.params.id, req.usuario.id, req.body));
}

async function cambiarEstado(req, res) {
  res.status(200).json(
    await publicarService.cambiarEstado(req.params.id, req.usuario.id, req.body.estado)
  );
}

async function eliminar(req, res) {
  res.status(200).json(await publicarService.eliminar(req.params.id, req.usuario.id));
}

async function mias(req, res) {
  res.status(200).json(await publicarService.misPublicaciones(req.usuario.id, req.query));
}

async function obtenerBorrador(req, res) {
  res.status(200).json(await publicarService.obtenerBorrador(req.usuario.id));
}

async function guardarBorrador(req, res) {
  res.status(200).json(
    await publicarService.guardarBorrador(req.usuario.id, {
      datos: req.body.datos,
      paso: req.body.paso,
    })
  );
}

async function descartarBorrador(req, res) {
  res.status(200).json(await publicarService.descartarBorrador(req.usuario.id));
}

module.exports = {
  crear, editar, cambiarEstado, eliminar, mias,
  obtenerBorrador, guardarBorrador, descartarBorrador,
};

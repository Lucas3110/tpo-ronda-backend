// Punto 9: historial de operaciones y calificaciones.
// Punto 12: confirmación de la entrega con el QR.
const operacionService = require('../services/operacionService');
const cierreService = require('../services/cierreService');

async function historial(req, res) {
  res.status(200).json(await operacionService.listarHistorial(req.usuario.id, req.query));
}

async function pendientesDeCalificar(req, res) {
  res.status(200).json(await operacionService.pendientesDeCalificar(req.usuario.id));
}

async function calificar(req, res) {
  res.status(201).json(
    await operacionService.calificar(req.params.id, req.usuario.id, {
      estrellas: req.body.estrellas,
      comentario: req.body.comentario,
    })
  );
}

async function calificacionesDeUsuario(req, res) {
  res.status(200).json(await operacionService.calificacionesDe(req.params.id));
}

async function confirmarEntrega(req, res) {
  res.status(200).json(await cierreService.confirmarEntrega(req.usuario.id, req.body.codigo));
}

module.exports = {
  historial,
  pendientesDeCalificar,
  calificar,
  calificacionesDeUsuario,
  confirmarEntrega,
};

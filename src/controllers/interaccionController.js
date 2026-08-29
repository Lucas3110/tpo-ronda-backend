// Punto 4: preguntas y ofertas.
const interaccionService = require('../services/interaccionService');

async function listarPreguntas(req, res) {
  res.status(200).json(await interaccionService.listarPreguntas(req.params.id));
}

async function preguntar(req, res) {
  res.status(201).json(
    await interaccionService.preguntar(req.params.id, req.usuario.id, req.body.texto)
  );
}

async function responder(req, res) {
  res.status(200).json(
    await interaccionService.responder(req.params.id, req.usuario.id, req.body.respuesta)
  );
}

async function listarOfertas(req, res) {
  res.status(200).json(
    await interaccionService.listarOfertas(req.params.id, req.usuario.id)
  );
}

async function ofertar(req, res) {
  res.status(201).json(
    await interaccionService.ofertar(req.params.id, req.usuario.id, req.body.monto)
  );
}

async function responderOferta(req, res) {
  res.status(200).json(
    await interaccionService.responderOferta(req.params.id, req.usuario.id, req.body.estado)
  );
}

module.exports = {
  listarPreguntas, preguntar, responder,
  listarOfertas, ofertar, responderOferta,
};

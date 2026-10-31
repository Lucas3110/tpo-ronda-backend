const servicio = require('../services/halladoEncuentroService');

async function obtener(req, res) {
  res.json(await servicio.obtener(req.params.id, req.usuario.id));
}
const accion = (nombre) => async (req, res) => {
  res.json(await servicio.cambiar(req.params.id, req.usuario.id, nombre, req.body));
};
module.exports = { obtener, proponer: accion('proponer'), aceptar: accion('aceptar'), concretar: accion('concretar') };

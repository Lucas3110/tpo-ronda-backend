// CAPA DE CONTROLLER del punto 8 de Hallado (el punto de encuentro): sólo
// traduce HTTP.
//
// Las tres responden el mismo DTO, el estado completo del encuentro. Así la
// app se queda con lo que devuelve la operación y no tiene que pedir el
// GET de nuevo para refrescar la pantalla.
const encuentros = require('../services/halladoEncuentroService');

// GET /api/hallado/reclamos/:id/encuentro
async function obtener(req, res) {
  res.status(200).json(await encuentros.obtener(req.params.id, req.usuario.id));
}

// POST /api/hallado/reclamos/:id/encuentro   { direccion, lat?, lng?, version }
// Primera propuesta y contrapropuesta: la misma operación.
async function proponer(req, res) {
  const dto = await encuentros.proponer(req.params.id, req.usuario.id, req.body);
  res.status(200).json(dto);
}

// POST /api/hallado/reclamos/:id/encuentro/aceptar   { version }
async function aceptar(req, res) {
  const dto = await encuentros.aceptar(req.params.id, req.usuario.id, req.body);
  res.status(200).json(dto);
}

module.exports = { obtener, proponer, aceptar };

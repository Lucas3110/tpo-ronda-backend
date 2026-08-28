// CAPA DE CONTROLLER: sólo traduce HTTP.
// Lee lo que vino en el request, llama al service y devuelve el DTO que el
// service armó. Nunca escribe SQL ni reglas de negocio acá.
//
// Nota: Express 5 captura solo las promesas rechazadas de estos handlers
// y se las pasa al middleware de errores, así que no hace falta try/catch.
const authService = require('../services/authService');

async function registrar(req, res) {
  const { email, password, nombre } = req.body;
  const dto = await authService.registrar({ email, password, nombre });
  res.status(201).json(dto);
}

async function enviarOtp(req, res) {
  const { email, proposito } = req.body;
  const dto = await authService.solicitarOtp({
    email,
    proposito: proposito || 'REGISTRO',
  });
  res.status(200).json(dto);
}

async function verificarOtp(req, res) {
  const { email, codigo, proposito } = req.body;
  const dto = await authService.verificarOtp({
    email,
    codigo,
    proposito: proposito || 'REGISTRO',
  });
  res.status(200).json(dto);
}

module.exports = { registrar, enviarOtp, verificarOtp };

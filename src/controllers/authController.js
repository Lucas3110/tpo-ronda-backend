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

// Registro en dos pasos: primero el email, despues el codigo + los datos.
async function solicitarRegistro(req, res) {
  const { email } = req.body;
  const dto = await authService.solicitarRegistro({ email });
  res.status(201).json(dto);
}

async function confirmarRegistro(req, res) {
  const { email, codigo, nombre, password } = req.body;
  const dto = await authService.confirmarRegistro({ email, codigo, nombre, password });
  res.status(200).json(dto);
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

async function login(req, res) {
  const { email, password } = req.body;
  const dto = await authService.login({ email, password });
  res.status(200).json(dto);
}

// Recupero de contrasena. Llamar a recuperarPassword otra vez es el
// "reenviar" del enunciado: el cooldown del OTP evita el abuso.
async function recuperarPassword(req, res) {
  const { email } = req.body;
  const dto = await authService.solicitarRecuperoPassword({ email });
  res.status(200).json(dto);
}

async function restablecerPassword(req, res) {
  const { email, codigo, password } = req.body;
  const dto = await authService.restablecerPassword({ email, codigo, password });
  res.status(200).json(dto);
}

async function perfil(req, res) {
  // req.usuario lo dejó el middleware autenticar()
  const dto = await authService.obtenerPerfil(req.usuario.id);
  res.status(200).json(dto);
}

module.exports = {
  registrar,
  solicitarRegistro,
  confirmarRegistro,
  enviarOtp,
  verificarOtp,
  login,
  recuperarPassword,
  restablecerPassword,
  perfil,
};

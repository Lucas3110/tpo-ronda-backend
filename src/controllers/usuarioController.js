// Punto 2: perfil, datos personales y reputación.
const usuarioService = require('../services/usuarioService');
const authService = require('../services/authService');

async function misDatos(req, res) {
  res.status(200).json(await usuarioService.obtenerDatosPersonales(req.usuario.id));
}

async function actualizarMisDatos(req, res) {
  const { nombre, telefono, zonaId, fotoUrl } = req.body;
  res.status(200).json(
    await usuarioService.actualizarDatosPersonales(req.usuario.id, { nombre, telefono, zonaId, fotoUrl })
  );
}

// Cambio de email en dos pasos: pedir el código y confirmarlo. La lógica vive
// en authService porque comparte con el login todo el manejo de OTP.
async function solicitarCambioEmail(req, res) {
  const { emailNuevo } = req.body || {};
  res.status(200).json(await authService.solicitarCambioEmail(req.usuario.id, { emailNuevo }));
}

async function confirmarCambioEmail(req, res) {
  const { codigo } = req.body || {};
  res.status(200).json(await authService.confirmarCambioEmail(req.usuario.id, { codigo }));
}

async function perfilPublico(req, res) {
  res.status(200).json(await usuarioService.obtenerPerfilPublico(req.params.id));
}

async function reputacion(req, res) {
  res.status(200).json(await usuarioService.obtenerReputacionPublica(req.params.id));
}

async function zonas(req, res) {
  res.status(200).json(await usuarioService.listarZonas());
}

module.exports = {
  misDatos,
  actualizarMisDatos,
  solicitarCambioEmail,
  confirmarCambioEmail,
  perfilPublico,
  reputacion,
  zonas,
};

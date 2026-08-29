// Punto 2: perfil, datos personales y reputación.
const usuarioService = require('../services/usuarioService');

async function misDatos(req, res) {
  res.status(200).json(await usuarioService.obtenerDatosPersonales(req.usuario.id));
}

async function actualizarMisDatos(req, res) {
  const { nombre, telefono, zonaId } = req.body;
  res.status(200).json(
    await usuarioService.actualizarDatosPersonales(req.usuario.id, { nombre, telefono, zonaId })
  );
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

module.exports = { misDatos, actualizarMisDatos, perfilPublico, reputacion, zonas };

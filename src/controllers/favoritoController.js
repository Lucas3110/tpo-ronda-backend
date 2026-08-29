// Punto 6: favoritos y búsquedas guardadas.
const favoritoService = require('../services/favoritoService');

async function marcar(req, res) {
  res.status(201).json(await favoritoService.marcarFavorito(req.params.id, req.usuario.id));
}

async function quitar(req, res) {
  res.status(200).json(await favoritoService.quitarFavorito(req.params.id, req.usuario.id));
}

async function listar(req, res) {
  res.status(200).json(await favoritoService.listarFavoritos(req.usuario.id, req.query));
}

async function guardarBusqueda(req, res) {
  res.status(201).json(
    await favoritoService.guardarBusqueda(req.usuario.id, {
      nombre: req.body.nombre,
      filtros: req.body.filtros,
    })
  );
}

async function listarBusquedas(req, res) {
  res.status(200).json(await favoritoService.listarBusquedas(req.usuario.id));
}

async function resultadosBusqueda(req, res) {
  res.status(200).json(
    await favoritoService.ejecutarBusqueda(req.usuario.id, req.params.id, req.query)
  );
}

async function eliminarBusqueda(req, res) {
  res.status(200).json(await favoritoService.eliminarBusqueda(req.usuario.id, req.params.id));
}

module.exports = {
  marcar, quitar, listar,
  guardarBusqueda, listarBusquedas, resultadosBusqueda, eliminarBusqueda,
};

// Rutas de Hallado. Todas cuelgan de /api/hallado
//
// Están separadas de las de Ronda a propósito: son dos dominios distintos
// sobre la misma base, y mezclarlas haría que no se entienda cuál endpoint
// pertenece a qué entrega.
const express = require('express');
const controller = require('../controllers/halladoPublicacionController');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

// --- Catálogos (públicos: la app los necesita para armar los formularios y
//     el buscador antes de que la persona haga nada) ---
router.get('/categorias', controller.categorias);
router.get('/barrios', controller.barrios);

// --- Punto 5: publicar (todo privado, hace falta sesión) ---
// La subida va antes que el alta: la app sube las fotos, junta las urls y
// recien ahi crea la publicacion.
router.post('/fotos', autenticar, controller.subirFoto);

router.post('/publicaciones', autenticar, controller.crear);

// "Mis publicaciones" va ANTES de /:id. Si no, Express toma "mias" como un id
// y la ruta nunca llega acá.
router.get('/publicaciones/mias', autenticar, controller.mias);

router.get('/publicaciones/:id/propia', autenticar, controller.obtenerPropia);
router.patch('/publicaciones/:id', autenticar, controller.editar);
router.post('/publicaciones/:id/renovar', autenticar, controller.renovar);
router.delete('/publicaciones/:id', autenticar, controller.eliminar);

module.exports = router;

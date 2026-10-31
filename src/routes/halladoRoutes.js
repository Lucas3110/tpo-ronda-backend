// Rutas de Hallado. Todas cuelgan de /api/hallado
//
// Están separadas de las de Ronda a propósito: son dos dominios distintos
// sobre la misma base, y mezclarlas haría que no se entienda cuál endpoint
// pertenece a qué entrega.
const express = require('express');
const controller = require('../controllers/halladoPublicacionController');
const reclamos = require('../controllers/halladoReclamoController');
const historial = require('../controllers/halladoHistorialController');
const valoraciones = require('../controllers/halladoValoracionController');
const perfiles = require('../controllers/halladoPerfilController');
const alertas = require('../controllers/halladoAlertaController');
const encuentros = require('../controllers/halladoEncuentroController');
const { autenticar } = require('../middlewares/auth');
const { autenticarOpcional } = require('../middlewares/authOpcional');

const router = express.Router();

// --- Catálogos (públicos: la app los necesita para armar los formularios y
//     el buscador antes de que la persona haga nada) ---
router.get('/categorias', controller.categorias);
router.get('/barrios', controller.barrios);

// Punto 3: el buscador. Publico, porque el enunciado no pide sesion para
// mirar, y asi la app puede mostrar resultados antes de pedir nada.
router.get('/publicaciones', controller.buscar);

// --- Punto 5: publicar (todo privado, hace falta sesión) ---
// La subida va antes que el alta: la app sube las fotos, junta las urls y
// recien ahi crea la publicacion.
router.post('/fotos', autenticar, controller.subirFoto);

router.post('/publicaciones', autenticar, controller.crear);

// "Mis publicaciones" va ANTES de /:id. Si no, Express toma "mias" como un id
// y la ruta nunca llega acá.
router.get('/publicaciones/mias', autenticar, controller.mias);

// Punto 4: el detalle. Público con token opcional: la dirección exacta y las
// acciones disponibles dependen de quién mira, y sin sesión se ve lo mismo
// que ve un tercero.
router.get('/publicaciones/:id', autenticarOpcional, controller.obtenerDetalle);

// Punto 4: seguir una publicación para enterarse de sus novedades. La lista
// de seguidas y el aviso de novedad son del punto 9 (más abajo).
router.post('/publicaciones/:id/seguir', autenticar, controller.seguir);
router.delete('/publicaciones/:id/seguir', autenticar, controller.dejarDeSeguir);

// --- Punto 7: reclamos (todo privado) ---
// "Es mío" sobre algo encontrado, "Lo encontré" sobre algo perdido.
router.post('/publicaciones/:id/reclamos', autenticar, reclamos.crear);

// "Mis reclamos": los que envié y los que recibí, en un mismo lugar. Va
// ANTES de /reclamos/:id por la misma razón que /publicaciones/mias.
router.get('/reclamos/mios', autenticar, reclamos.mios);
router.get('/reclamos/:id', autenticar, reclamos.obtener);

// El publicador acepta o rechaza cada reclamo.
router.post('/reclamos/:id/aceptar', autenticar, reclamos.aceptar);
router.post('/reclamos/:id/rechazar', autenticar, reclamos.rechazar);

// --- Punto 8: punto de encuentro (todo privado y sólo para las dos partes
//     de un reclamo ya aceptado) ---
// Cuelgan del reclamo porque el encuentro es de ese acuerdo y no de la
// publicación: una publicación puede haber tenido varios reclamos.
//
// No chocan con /reclamos/:id de más arriba, ni entre sí: "encuentro" es un
// segmento fijo y no un :parametro, así que Express no puede tomar una por
// otra y acá el orden no cambia nada.
router.get('/reclamos/:id/encuentro', autenticar, encuentros.obtener);
router.post('/reclamos/:id/encuentro', autenticar, encuentros.proponer);
router.post('/reclamos/:id/encuentro/aceptar', autenticar, encuentros.aceptar);

// --- Punto 10: historial de casos resueltos ---
router.get('/historial', autenticar, historial.listar);

// Cada parte valora a la otra dentro de los 7 días de la devolución.
router.post('/reclamos/:id/valoracion', autenticar, valoraciones.valorar);

// --- Punto 2: el perfil público (reputación, insignias y antigüedad) ---
// Público: el detalle de una publicación (punto 4) lleva a este perfil
// antes de que la persona decida reclamar.
router.get('/usuarios/:id/perfil', perfiles.perfilPublico);

// Los agradecimientos públicos de una persona, para su perfil (punto 2).
router.get('/usuarios/:id/agradecimientos', valoraciones.agradecimientos);

// --- Punto 9: alertas, seguidas y el indicador de novedad (todo privado) ---
// Una alerta es una búsqueda del punto 3 guardada con sus criterios.
router.post('/alertas', autenticar, alertas.crear);
router.get('/alertas', autenticar, alertas.listar);
router.patch('/alertas/:id', autenticar, alertas.cambiarEstado);
router.delete('/alertas/:id', autenticar, alertas.eliminar);
router.get('/alertas/:id/publicaciones', autenticar, alertas.publicaciones);
router.post('/alertas/:id/vista', autenticar, alertas.marcarVista);

// Las publicaciones que la persona sigue (se siguen desde el detalle, punto 4).
router.get('/seguidas', autenticar, alertas.seguidas);

// El resumen para prender el indicador de las dos secciones.
router.get('/novedades', autenticar, alertas.resumenNovedades);

router.get('/publicaciones/:id/propia', autenticar, controller.obtenerPropia);
router.patch('/publicaciones/:id', autenticar, controller.editar);
router.post('/publicaciones/:id/renovar', autenticar, controller.renovar);
router.delete('/publicaciones/:id', autenticar, controller.eliminar);

module.exports = router;

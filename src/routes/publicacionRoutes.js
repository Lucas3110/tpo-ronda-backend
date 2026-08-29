// Rutas del Punto 3. Cuelgan de /api/publicaciones
const express = require('express');
const controller = require('../controllers/publicacionController');
const interacciones = require('../controllers/interaccionController');
const { autenticar } = require('../middlewares/auth');
const { autenticarOpcional } = require('../middlewares/authOpcional');

const router = express.Router();

// Pública, pero con token opcional: si hay sesión se puede ordenar por
// cercanía a la zona de esa persona.
router.get('/', autenticarOpcional, controller.listar);

// Punto 4: el detalle tambien es publico, pero devuelve las acciones
// disponibles segun quien este mirando.
router.get('/:id', autenticarOpcional, controller.detalle);

// Preguntas: leerlas es publico, hacerlas requiere sesion.
router.get('/:id/preguntas', interacciones.listarPreguntas);
router.post('/:id/preguntas', autenticar, interacciones.preguntar);

// Ofertas: siempre con sesion. El vendedor ve todas, un interesado solo
// las propias.
router.get('/:id/ofertas', autenticar, interacciones.listarOfertas);
router.post('/:id/ofertas', autenticar, interacciones.ofertar);

module.exports = router;

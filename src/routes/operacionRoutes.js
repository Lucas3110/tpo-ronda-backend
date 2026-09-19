// Historial y calificaciones (Punto 9). Cuelga de /api/operaciones.
const express = require('express');
const controller = require('../controllers/operacionController');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

// Va ANTES de cualquier /:id, si no Express toma el texto como un id.
router.get('/pendientes-calificar', autenticar, controller.pendientesDeCalificar);

// ?tipo=COMPRA|VENTA&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
router.get('/', autenticar, controller.historial);

router.post('/:id/calificacion', autenticar, controller.calificar);

module.exports = router;

// Historial y calificaciones (Punto 9) y cierre con QR (Punto 12).
// Cuelga de /api/operaciones.
const express = require('express');
const controller = require('../controllers/operacionController');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

// Van ANTES de cualquier /:id, si no Express toma el texto como un id.
router.get('/pendientes-calificar', autenticar, controller.pendientesDeCalificar);

// Punto 12: el comprador manda lo que leyó del QR físico.   { codigo }
router.post('/confirmar-entrega', autenticar, controller.confirmarEntrega);

// ?tipo=COMPRA|VENTA&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
router.get('/', autenticar, controller.historial);

router.post('/:id/calificacion', autenticar, controller.calificar);

module.exports = router;

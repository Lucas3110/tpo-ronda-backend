// Ofertas y negociación. Cuelga de /api/ofertas.
const express = require('express');
const controller = require('../controllers/interaccionController');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

// Punto 7: "Mis ofertas" — las que envié y las que recibí, en un solo lugar.
// Va ANTES de /:id, si no Express toma "mias" como un id.
router.get('/mias', autenticar, controller.misOfertas);

// Aceptar o rechazar. Quién puede hacerlo depende de quién propuso el monto:
// una oferta del comprador la responde el vendedor, y una contraoferta del
// vendedor la responde el comprador.
router.patch('/:id', autenticar, controller.responderOferta);

// Punto 7: contraoferta con un nuevo precio.
router.post('/:id/contraoferta', autenticar, controller.contraofertar);

module.exports = router;

// Aceptar o rechazar una oferta. Cuelga de /api/ofertas.
const express = require('express');
const controller = require('../controllers/interaccionController');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

router.patch('/:id', autenticar, controller.responderOferta);

module.exports = router;

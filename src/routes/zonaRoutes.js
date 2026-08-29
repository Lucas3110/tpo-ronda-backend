// Rutas del catálogo de zonas. Cuelgan de /api/zonas
const express = require('express');
const controller = require('../controllers/usuarioController');

const router = express.Router();

// Pública: la app la necesita para armar el selector de zona,
// incluso antes de que la persona tenga cuenta.
router.get('/', controller.zonas);

module.exports = router;

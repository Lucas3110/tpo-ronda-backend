// Catálogo de categorías. Cuelga de /api/categorias
const express = require('express');
const controller = require('../controllers/publicacionController');

const router = express.Router();

router.get('/', controller.categorias);

module.exports = router;

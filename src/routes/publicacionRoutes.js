// Rutas del Punto 3. Cuelgan de /api/publicaciones
const express = require('express');
const controller = require('../controllers/publicacionController');
const { autenticarOpcional } = require('../middlewares/authOpcional');

const router = express.Router();

// Pública, pero con token opcional: si hay sesión se puede ordenar por
// cercanía a la zona de esa persona.
router.get('/', autenticarOpcional, controller.listar);

module.exports = router;

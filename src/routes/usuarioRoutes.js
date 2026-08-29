// Rutas del Punto 2. Cuelgan de /api/usuarios
const express = require('express');
const controller = require('../controllers/usuarioController');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

// --- Privadas: los datos propios ---
router.get('/me', autenticar, controller.misDatos);
router.put('/me', autenticar, controller.actualizarMisDatos);

// --- Públicas: lo que se consulta antes de operar con alguien ---
// Van después de /me para que "me" no se confunda con un :id.
router.get('/:id/perfil', controller.perfilPublico);
router.get('/:id/reputacion', controller.reputacion);

module.exports = router;

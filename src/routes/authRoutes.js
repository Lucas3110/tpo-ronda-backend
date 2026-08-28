// Rutas de autenticación. Todas cuelgan de /api/auth
const express = require('express');
const controller = require('../controllers/authController');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

// --- Públicas ---
// Alta de cuenta: crea el usuario y dispara el primer OTP.
router.post('/registro', controller.registrar);

// Envía (o reenvía) un código. proposito: 'REGISTRO' | 'LOGIN'
router.post('/otp/enviar', controller.enviarOtp);

// Confirma el código y crea la sesión (devuelve el token).
router.post('/otp/verificar', controller.verificarOtp);

// Login clásico con email + contraseña.
router.post('/login', controller.login);

// --- Privadas (requieren Authorization: Bearer <token>) ---
router.get('/me', autenticar, controller.perfil);

module.exports = router;

// Rutas de autenticación. Todas cuelgan de /api/auth
const express = require('express');
const controller = require('../controllers/authController');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

// --- Públicas ---
// Alta de cuenta: crea el usuario y dispara el primer OTP.
router.post('/registro', controller.registrar);

// Registro, en el orden que pide el enunciado de Hallado: solicitar email ->
// recibir el codigo -> confirmarlo -> definir la contrasena.
//
// Son tres pedidos y no dos porque el codigo se verifica solo, en su propia
// pantalla. /verificar lo consume y devuelve un ticket corto; /confirmar
// recibe ese ticket con el nombre y la contrasena. Asi un codigo mal escrito
// se avisa en el momento, y no despues de llenar todo el formulario.
//
// /confirmar sigue aceptando el codigo directo, que es el camino viejo de
// un solo paso: la regresion y Postman lo usan asi.
router.post('/registro/solicitar', controller.solicitarRegistro);
router.post('/registro/verificar', controller.verificarRegistro);
router.post('/registro/confirmar', controller.confirmarRegistro);

// Envía (o reenvía) un código. proposito: 'REGISTRO' | 'LOGIN'
router.post('/otp/enviar', controller.enviarOtp);

// Confirma el código y crea la sesión (devuelve el token).
router.post('/otp/verificar', controller.verificarOtp);

// Login clásico con email + contraseña.
router.post('/login', controller.login);

// Recupero de contraseña. Volver a llamar a /recuperar es el "reenviar".
router.post('/password/recuperar', controller.recuperarPassword);
router.post('/password/restablecer', controller.restablecerPassword);

// --- Privadas (requieren Authorization: Bearer <token>) ---
router.get('/me', autenticar, controller.perfil);

module.exports = router;

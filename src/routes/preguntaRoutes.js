// Responder una pregunta cuelga de /api/preguntas porque la accion es
// sobre la pregunta, no sobre la publicacion.
const express = require('express');
const controller = require('../controllers/interaccionController');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

router.post('/:id/respuesta', autenticar, controller.responder);

module.exports = router;

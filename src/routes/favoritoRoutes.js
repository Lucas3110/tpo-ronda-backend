// "Mis favoritos". Cuelga de /api/favoritos
const express = require('express');
const controller = require('../controllers/favoritoController');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

router.get('/', autenticar, controller.listar);

module.exports = router;

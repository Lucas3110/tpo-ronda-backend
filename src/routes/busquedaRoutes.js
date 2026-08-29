// Búsquedas guardadas. Cuelgan de /api/busquedas-guardadas
const express = require('express');
const controller = require('../controllers/favoritoController');
const { autenticar } = require('../middlewares/auth');

const router = express.Router();

router.get('/', autenticar, controller.listarBusquedas);
router.post('/', autenticar, controller.guardarBusqueda);

// Correr la búsqueda guardada. Además marca que ya la vio, así se apaga el
// indicador de novedad.
router.get('/:id/resultados', autenticar, controller.resultadosBusqueda);

router.delete('/:id', autenticar, controller.eliminarBusqueda);

module.exports = router;

// Router raíz: acá se van enganchando los routers de cada punto de la consigna.
const express = require('express');
const authRoutes = require('./authRoutes');
const usuarioRoutes = require('./usuarioRoutes');
const zonaRoutes = require('./zonaRoutes');

const router = express.Router();

// Sirve para chequear rápido desde el celular que la API se ve en la red.
router.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'ronda-api', hora: new Date().toISOString() });
});

router.use('/auth', authRoutes);       // Punto 1
router.use('/usuarios', usuarioRoutes); // Punto 2
router.use('/zonas', zonaRoutes);       // Punto 2

module.exports = router;

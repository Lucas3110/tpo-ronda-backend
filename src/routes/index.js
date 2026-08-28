// Router raíz: acá se van a ir enganchando los routers de cada punto del TPO.
const express = require('express');
const authRoutes = require('./authRoutes');

const router = express.Router();

// Sirve para chequear rápido desde el celular que la API se ve en la red.
router.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'ronda-api', hora: new Date().toISOString() });
});

router.use('/auth', authRoutes);

// Punto 3 -> router.use('/publicaciones', publicacionesRoutes);
// Punto 2 -> router.use('/usuarios', usuariosRoutes);

module.exports = router;

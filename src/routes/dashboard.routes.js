const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth.middleware');
const {
  obtenerResumen,
  listarAlertas,
  listarCitasProximas
} = require('../controllers/dashboard.controller');

// Todas las rutas requieren autenticación
router.use(verificarToken);

router.get('/resumen', obtenerResumen);
router.get('/alertas', listarAlertas);
router.get('/citas-proximas', listarCitasProximas);

module.exports = router;
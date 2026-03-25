const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth.middleware');
const {
  listarCitas,
  obtenerCita,
  crearCita,
  actualizarCita,
  cancelarCita,
  confirmarCita,
  reprogramarCita
} = require('../controllers/citas.controller');

// Todas las rutas requieren autenticación
router.use(verificarToken);

// Rutas principales
router.get('/', listarCitas);
router.post('/', crearCita);

// Rutas específicas (van antes de :id)
router.post('/:id/confirmar', confirmarCita);
router.post('/:id/reprogramar', reprogramarCita);

// Rutas con parámetro id
router.get('/:id', obtenerCita);
router.put('/:id', actualizarCita);
router.delete('/:id', cancelarCita);

module.exports = router;
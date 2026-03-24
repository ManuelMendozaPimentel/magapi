const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth.middleware');
const {
  listarPacientes,
  obtenerPaciente,
  actualizarDatosClinicos,
  desvincularPaciente
} = require('../controllers/pacientes.controller');

// JWT requerido en todas las rutas
router.use(verificarToken);

router.get('/',                          listarPacientes);
router.get('/:id',                       obtenerPaciente);
router.put('/:id/datos-clinicos',        actualizarDatosClinicos);
router.delete('/:id/vincular',           desvincularPaciente);

module.exports = router;
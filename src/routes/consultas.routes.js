const express = require('express');
const router  = express.Router();
const { verificarToken } = require('../middleware/auth.middleware');
const {
  crearConsulta,
  listarConsultasDoctor,
  listarConsultasPaciente,
  obtenerConsulta
} = require('../controllers/consultas.controller');

// JWT requerido en todas las rutas
router.use(verificarToken);

router.post('/',                          crearConsulta);
router.get('/',                           listarConsultasDoctor);
router.get('/paciente/:pacienteId',       listarConsultasPaciente);
router.get('/:id',                        obtenerConsulta);

module.exports = router;
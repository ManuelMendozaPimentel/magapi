const express = require('express');
const router = express.Router();
const { 
  registroDoctor, 
  reenviarCodigo, 
  verificarCodigo, 
  login 
} = require('../controllers/auth.controller');
const { validarRegistroDoctor } = require('../middleware/validation');

// POST /api/auth/registro - Registrar nuevo doctor
router.post('/registro', validarRegistroDoctor, registroDoctor);

// POST /api/auth/reenviar-codigo - Reenviar código de verificación
router.post('/reenviar-codigo', reenviarCodigo);

// POST /api/auth/verificar-codigo - Verificar código de 6 dígitos
router.post('/verificar-codigo', verificarCodigo);

// POST /api/auth/login - Iniciar sesión
router.post('/login', login);

module.exports = router;
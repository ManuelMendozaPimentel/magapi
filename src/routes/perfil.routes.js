const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth.middleware');
const {
  obtenerPerfil,
  editarPerfil,
  solicitarCambioCorreo,
  confirmarCambioCorreo,
  cambiarPassword,
  listarConsultorios,
  crearConsultorio,
  obtenerConsultorio,
  editarConsultorio,
  eliminarConsultorio,
  actualizarVisibilidadConsultorio,
  obtenerNotificaciones,
  actualizarNotificaciones
} = require('../controllers/perfil.controller');

// JWT requerido en todas las rutas
router.use(verificarToken);

// ── Perfil ───────────────────────────────────────────
router.get('/',                                    obtenerPerfil);
router.put('/',                                    editarPerfil);
router.post('/cambiar-correo',                     solicitarCambioCorreo);
router.post('/confirmar-correo',                   confirmarCambioCorreo);
router.post('/cambiar-password',                   cambiarPassword);

// ── Consultorios ─────────────────────────────────────
router.get('/consultorios',                        listarConsultorios);
router.post('/consultorios',                       crearConsultorio);
router.get('/consultorios/:id',                    obtenerConsultorio);
router.put('/consultorios/:id',                    editarConsultorio);
router.delete('/consultorios/:id',                 eliminarConsultorio);
router.put('/consultorios/:id/visibilidad',        actualizarVisibilidadConsultorio);

// ── Notificaciones ───────────────────────────────────
router.get('/notificaciones',                      obtenerNotificaciones);
router.put('/notificaciones',                      actualizarNotificaciones);

module.exports = router;
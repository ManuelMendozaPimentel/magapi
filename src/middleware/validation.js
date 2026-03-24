/**
 * Valida datos de registro de doctor
 */
function validarRegistroDoctor(req, res, next) {
  const { nombre_completo, correo, password, cedula_profesional, institucion_procedencia } = req.body;
  
  const errores = [];
  
  // Nombre
  if (!nombre_completo || nombre_completo.trim().length < 5) {
    errores.push('El nombre completo es requerido (mínimo 5 caracteres)');
  }
  
  // Correo
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!correo || !emailRegex.test(correo)) {
    errores.push('El correo electrónico no es válido');
  }
  
  // Contraseña
  if (!password || password.length < 8) {
    errores.push('La contraseña debe tener al menos 8 caracteres');
  }
  
  // Cédula profesional
  if (!cedula_profesional || !/^\d{6,8}$/.test(cedula_profesional)) {
    errores.push('La cédula profesional debe ser de 6 a 8 dígitos');
  }
  
  // Institución
  if (!institucion_procedencia || institucion_procedencia.trim().length < 3) {
    errores.push('La institución de procedencia es requerida');
  }
  
  if (errores.length > 0) {
    return res.status(400).json({
      success: false,
      errores
    });
  }
  
  next();
}

module.exports = { validarRegistroDoctor };
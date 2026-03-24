const jwt = require('jsonwebtoken');

/**
 * Verifica el JWT en el header Authorization.
 * Si es válido, agrega req.doctor = { id, correo, nombre }
 */
function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Token de autenticación requerido'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.doctor = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Tu sesión ha expirado. Inicia sesión nuevamente.'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
  }
}

module.exports = { verificarToken };
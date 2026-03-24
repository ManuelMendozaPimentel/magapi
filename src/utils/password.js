const bcrypt = require('bcryptjs');

// Hash de contraseña
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

// Verificar contraseña
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

module.exports = { hashPassword, verifyPassword };
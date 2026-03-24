const crypto = require('crypto');
const pool = require('../config/database');

/**
 * Genera token seguro para verificación de email
 */
function generarTokenVerificacion() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Guarda token en la tabla doctores
 */
async function guardarTokenVerificacion(doctorId, token) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas
  
  await pool.query(
    `UPDATE doctores 
     SET verification_token = $1, 
         verification_token_expires_at = $2 
     WHERE id = $3`,
    [token, expiresAt, doctorId]
  );
}

/**
 * Valida token de verificación
 */
async function validarTokenVerificacion(token) {
  const result = await pool.query(
    `SELECT id, verification_token_expires_at 
     FROM doctores 
     WHERE verification_token = $1 
       AND verification_token_expires_at > NOW()`,
    [token]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0];
}

/**
 * Limpia token después de usar
 */
async function limpiarTokenVerificacion(doctorId) {
  await pool.query(
    `UPDATE doctores 
     SET verification_token = NULL, 
         verification_token_expires_at = NULL 
     WHERE id = $1`,
    [doctorId]
  );
}

module.exports = {
  generarTokenVerificacion,
  guardarTokenVerificacion,
  validarTokenVerificacion,
  limpiarTokenVerificacion
};
const crypto = require('crypto');

/**
 * Genera código numérico de 6 dígitos para verificación
 * Ejemplo: 847291
 */
function generarCodigoVerificacion() {
  // Genera número aleatorio entre 100000 y 999999
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Genera código de vinculación alfanumérico para doctor-paciente
 * Formato: NT-XXXXXX (ej: NT-X7K9M2)
 */
function generarCodigoVinculacion() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin I, O, 0, 1 para evitar confusión
  let codigo = 'NT-';
  
  for (let i = 0; i < 6; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    codigo += chars.charAt(randomIndex);
  }
  
  return codigo;
}

/**
 * Verifica que el código de vinculación no exista en la base de datos
 */
async function verificarCodigoVinculacionDisponible(pool, codigo) {
  const result = await pool.query(
    'SELECT EXISTS(SELECT 1 FROM doctores WHERE codigo_vinculacion = $1)',
    [codigo]
  );
  return !result.rows[0].exists;
}

/**
 * Genera código de vinculación único (reintenta si ya existe)
 */
async function generarCodigoVinculacionUnico(pool, maxIntentos = 5) {
  for (let i = 0; i < maxIntentos; i++) {
    const codigo = generarCodigoVinculacion();
    const disponible = await verificarCodigoVinculacionDisponible(pool, codigo);
    
    if (disponible) {
      return codigo;
    }
  }
  throw new Error('No se pudo generar un código de vinculación único');
}

module.exports = { 
  generarCodigoVerificacion,      // Para email: 847291
  generarCodigoVinculacion,       // Para pacientes: NT-X7K9M2
  generarCodigoVinculacionUnico   // Con verificación en BD
};
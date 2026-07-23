const { Pool } = require('pg');
require('dotenv').config();

// Detectar si estamos en producción (AWS EB)
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  
  // ✅ Configuración SSL correcta para producción
  ssl: isProduction ? {
    rejectUnauthorized: true  // En producción, verificar certificado
  } : false,                  // En local, sin SSL
  
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Error en PostgreSQL:', err);
  process.exit(-1);
});

module.exports = pool;
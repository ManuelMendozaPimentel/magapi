const pool = require('../config/database');
const { hashPassword, verifyPassword } = require('../utils/password');
const { generarCodigoVinculacionUnico, generarCodigoVerificacion } = require('../utils/codigo');
const { enviarCodigoVerificacion, enviarEmailActivacion } = require('../services/email.service');
const jwt = require('jsonwebtoken');

/**
 * REGISTRO DE DOCTOR - Envía código de 6 dígitos al email
 * POST /api/auth/registro
 */
async function registroDoctor(req, res) {
  const client = await pool.connect();
  
  try {
    const { nombre_completo, correo, password, cedula_profesional, institucion_procedencia, especialidad, telefono } = req.body;
    
    // 1. Verificar si el correo ya existe
    const emailExistente = await client.query(
      'SELECT id, correo_verificado FROM doctores WHERE correo = $1',
      [correo]
    );
    
    if (emailExistente.rows.length > 0) {
      const doctor = emailExistente.rows[0];
      
      // Si ya está verificado, sugerir login o reenvío de código
      if (doctor.correo_verificado) {
        return res.status(409).json({
          success: false,
          message: 'El correo electrónico ya está registrado. Intenta iniciar sesión.'
        });
      } else {
        return res.status(409).json({
          success: false,
          message: 'El correo ya está registrado pero sin verificar. Solicita un nuevo código.'
        });
      }
    }
    
    // 2. Verificar si la cédula ya existe
    const cedulaExistente = await client.query(
      'SELECT id FROM doctores WHERE cedula_profesional = $1',
      [cedula_profesional]
    );
    
    if (cedulaExistente.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'La cédula profesional ya está registrada'
      });
    }
    
    // 3. Generar código de vinculación único
    const codigo_vinculacion = await generarCodigoVinculacionUnico(client);
    
    // 4. Hashear contraseña
    const password_hash = await hashPassword(password);
    
    // 5. Insertar doctor con estado inicial
    const result = await client.query(
      `INSERT INTO doctores (
        nombre_completo, correo, password_hash, cedula_profesional,
        codigo_vinculacion, institucion_procedencia, especialidad, telefono,
        correo_verificado, cedula_verificada, cuenta_activa,
        verification_attempts, verification_attempts_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, FALSE, FALSE, 0, NULL)
      RETURNING id, nombre_completo, correo, codigo_vinculacion, created_at`,
      [
        nombre_completo,
        correo,
        password_hash,
        cedula_profesional,
        codigo_vinculacion,
        institucion_procedencia,
        especialidad || null,
        telefono || null
      ]
    );
    
    const doctor = result.rows[0];
    
    // 6. Generar código de verificación de 6 dígitos
    const verification_code = generarCodigoVerificacion();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
    
    // 7. Guardar código en BD
    await client.query(
      `UPDATE doctores 
       SET verification_code = $1, 
           verification_code_expires_at = $2,
           verification_attempts = 0,
           verification_attempts_date = CURRENT_DATE
       WHERE id = $3`,
      [verification_code, expiresAt, doctor.id]
    );
    
    // 8. Enviar email con el código
    await enviarCodigoVerificacion(correo, verification_code);
    
    // 9. Response exitoso (NO exponer el código en la respuesta)
    res.status(201).json({
      success: true,
      message: 'Registro exitoso. Hemos enviado un código de verificación a tu correo.',
      data: {
        id: doctor.id,
        nombre_completo: doctor.nombre_completo,
        correo: doctor.correo,
        codigo_vinculacion: doctor.codigo_vinculacion,
        correo_verificado: false,
        cedula_verificada: false,
        cuenta_activa: false,
        code_expires_in: '15 minutos'
      }
    });
    
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
}

/**
 * REENVIAR CÓDIGO DE VERIFICACIÓN
 * POST /api/auth/reenviar-codigo
 */
async function reenviarCodigo(req, res) {
  try {
    const { correo } = req.body;
    
    if (!correo) {
      return res.status(400).json({
        success: false,
        message: 'El correo electrónico es requerido'
      });
    }
    
    // 1. Buscar doctor
    const result = await pool.query(
      'SELECT * FROM doctores WHERE correo = $1',
      [correo]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró una cuenta con este correo'
      });
    }
    
    const doctor = result.rows[0];
    
    // 2. Verificar si ya está verificado
    if (doctor.correo_verificado) {
      return res.status(400).json({
        success: false,
        message: 'Tu correo ya está verificado. Puedes iniciar sesión.'
      });
    }
    
    // 3. Verificar límite de reenvíos (5 por día)
    const hoy = new Date().toISOString().split('T')[0];
    
    if (doctor.verification_attempts_date?.toISOString().split('T')[0] === hoy && 
        doctor.verification_attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: 'Has alcanzado el límite de 5 intentos por día. Intenta mañana.'
      });
    }
    
    // 4. Generar nuevo código
    const verification_code = generarCodigoVerificacion();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    // 5. Actualizar en BD
    await pool.query(
      `UPDATE doctores 
       SET verification_code = $1, 
           verification_code_expires_at = $2,
           verification_attempts = verification_attempts + 1,
           verification_attempts_date = CURRENT_DATE
       WHERE id = $3`,
      [verification_code, expiresAt, doctor.id]
    );
    
    // 6. Enviar email
    await enviarCodigoVerificacion(correo, verification_code);
    
    res.json({
      success: true,
      message: 'Nuevo código enviado a tu correo. Expira en 15 minutos.',
      data: {
        code_expires_in: '15 minutos',
        intentos_restantes: 5 - (doctor.verification_attempts + 1)
      }
    });
    
  } catch (error) {
    console.error('Error al reenviar código:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

/**
 * VERIFICAR CÓDIGO DE 6 DÍGITOS
 * POST /api/auth/verificar-codigo
 */
async function verificarCodigo(req, res) {
  try {
    const { correo, codigo } = req.body;
    
    // Validaciones básicas
    if (!correo || !codigo) {
      return res.status(400).json({
        success: false,
        message: 'Correo y código son requeridos'
      });
    }
    
    if (!/^\d{6}$/.test(codigo)) {
      return res.status(400).json({
        success: false,
        message: 'El código debe ser de 6 dígitos numéricos'
      });
    }
    
    // 1. Buscar doctor
    const result = await pool.query(
      'SELECT * FROM doctores WHERE correo = $1',
      [correo]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró una cuenta con este correo'
      });
    }
    
    const doctor = result.rows[0];
    
    // 2. Verificar si ya está verificado
    if (doctor.correo_verificado) {
      return res.status(400).json({
        success: false,
        message: 'Tu correo ya está verificado. Puedes iniciar sesión.'
      });
    }
    
    // 3. Verificar límite de intentos por día
    const hoy = new Date().toISOString().split('T')[0];
    const attemptsDate = doctor.verification_attempts_date?.toISOString().split('T')[0];
    
    // Resetear contador si es un nuevo día
    if (attemptsDate !== hoy) {
      await pool.query(
        `UPDATE doctores 
         SET verification_attempts = 0, verification_attempts_date = CURRENT_DATE 
         WHERE id = $1`,
        [doctor.id]
      );
      doctor.verification_attempts = 0;
    }
    
    if (doctor.verification_attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: 'Has alcanzado el límite de 5 intentos por día. Intenta mañana.'
      });
    }
    
    // 4. Verificar código y expiración
    if (doctor.verification_code !== codigo) {
      // Incrementar intentos fallidos
      await pool.query(
        `UPDATE doctores 
         SET verification_attempts = verification_attempts + 1 
         WHERE id = $1`,
        [doctor.id]
      );
      
      const intentosRestantes = 5 - (doctor.verification_attempts + 1);
      
      return res.status(400).json({
        success: false,
        message: `Código incorrecto. Intentos restantes: ${intentosRestantes}`,
        data: {
          intentos_restantes: intentosRestantes
        }
      });
    }
    
    // 5. Verificar expiración
    if (new Date() > new Date(doctor.verification_code_expires_at)) {
      return res.status(400).json({
        success: false,
        message: 'El código ha expirado. Solicita uno nuevo.'
      });
    }
    
    // 6. Código válido - Activar correo
    await pool.query(
      `UPDATE doctores 
       SET correo_verificado = TRUE, 
           verified_at = NOW(),
           verification_code = NULL,
           verification_code_expires_at = NULL,
           verification_attempts = 0
       WHERE id = $1`,
      [doctor.id]
    );
    
    res.json({
      success: true,
      message: 'Correo verificado exitosamente. Tu cuenta está pendiente de aprobación por nuestro equipo.',
      data: {
        correo_verificado: true,
        cedula_verificada: doctor.cedula_verificada,
        cuenta_activa: doctor.cuenta_activa,
        next_step: 'Espera la verificación manual de tu cédula profesional'
      }
    });
    
  } catch (error) {
    console.error('Error en verificación de código:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

/**
 * LOGIN - Con verificación de estados
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { correo, password } = req.body;
    
    // 1. Buscar doctor
    const result = await pool.query(
      'SELECT * FROM doctores WHERE correo = $1',
      [correo]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }
    
    const doctor = result.rows[0];
    
    // 2. Verificar contraseña
    const passwordValido = await verifyPassword(password, doctor.password_hash);
    
    if (!passwordValido) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }
    
    // 3. Verificar estado del correo
    if (!doctor.correo_verificado) {
      return res.status(403).json({
        success: false,
        message: 'Debes verificar tu correo electrónico primero',
        data: {
          requires_email_verification: true
        }
      });
    }
    
    // 4. Verificar cédula profesional
    if (!doctor.cedula_verificada) {
      return res.status(403).json({
        success: false,
        message: 'Tu cuenta está pendiente de verificación. Hemos enviado tu cédula a revisión y te notificaremos por correo cuando sea aprobada.',
        data: {
          requires_cedula_verification: true,
          codigo_vinculacion: doctor.codigo_vinculacion
        }
      });
    }
    
    // 5. Verificar cuenta activa
    if (!doctor.cuenta_activa) {
      return res.status(403).json({
        success: false,
        message: 'Tu cuenta no está activa. Contacta a soporte.'
      });
    }
    
    // 6. Generar JWT
    const token = jwt.sign(
      { 
        id: doctor.id, 
        correo: doctor.correo,
        nombre: doctor.nombre_completo 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    
    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token,
        doctor: {
          id: doctor.id,
          nombre_completo: doctor.nombre_completo,
          correo: doctor.correo,
          especialidad: doctor.especialidad,
          codigo_vinculacion: doctor.codigo_vinculacion
        }
      }
    });
    
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

module.exports = { 
  registroDoctor, 
  reenviarCodigo, 
  verificarCodigo, 
  login 
};
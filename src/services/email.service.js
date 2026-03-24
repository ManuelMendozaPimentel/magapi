const nodemailer = require('nodemailer');
require('dns').setDefaultResultOrder('ipv4first');

// Configurar transporter con Gmail
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  socketTimeout: 10000,
  // ✅ Alternativa: usar 'family' en lugar de 'ipFamily' (depende de la versión)
  family: 4
});

// Logs de debug
console.log('📧 [Email Debug] HOST:', process.env.EMAIL_HOST);
console.log('📧 [Email Debug] PORT:', process.env.EMAIL_PORT, '(tipo:', typeof process.env.EMAIL_PORT, ')');
console.log('📧 [Email Debug] USER:', process.env.EMAIL_USER);
console.log('📧 [Email Debug] PASS length:', process.env.EMAIL_PASS?.length);
console.log('📧 [Email Debug] FROM:', process.env.EMAIL_FROM);
console.log('📧 [Email Debug] ipFamily: 4 (forzando IPv4)');

// Verificar configuración al iniciar
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Error configurando Gmail:', error.message);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error command:', error.command);
    console.error('❌ Error address:', error.address);
  } else {
    console.log('✅ Servidor de correo listo para enviar emails');
  }
});

/**
 * Envía email con código de verificación de 6 dígitos
 */
async function enviarCodigoVerificacion(correo, codigo) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: correo,
      subject: 'Tu código de verificación - NeuroTrack',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #2c7a6b; margin: 0;">NeuroTrack</h2>
          </div>
          
          <h3 style="color: #333;">Verifica tu correo electrónico</h3>
          <p style="color: #666; font-size: 16px;">
            Gracias por registrarte en NeuroTrack. Para completar tu registro, 
            ingresa el siguiente código de verificación:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <span style="display: inline-block; padding: 15px 30px; background-color: #f0f9f8; 
                         border: 2px solid #2c7a6b; border-radius: 8px; font-size: 32px; 
                         font-weight: bold; letter-spacing: 8px; color: #2c7a6b;">
              ${codigo}
            </span>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            ⏰ Este código expira en <strong>15 minutos</strong>.<br>
            🔒 Si no solicitaste este código, ignora este mensaje.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            NeuroTrack - Plataforma de monitoreo para pacientes con Parkinson<br>
            © 2024 Todos los derechos reservados
          </p>
        </div>
      `,
      text: `
        NeuroTrack - Verificación de correo
        
        Tu código de verificación es: ${codigo}
        
        Este código expira en 15 minutos.
        
        Si no solicitaste este código, ignora este mensaje.
        
        ---
        NeuroTrack - Plataforma de monitoreo para pacientes con Parkinson
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email de verificación enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error enviando email de verificación:', error.message);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error command:', error.command);
    throw error;
  }
}

/**
 * Envía email de cuenta activada
 */
async function enviarEmailActivacion(correo) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: correo,
      subject: 'Tu cuenta NeuroTrack ha sido activada',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #2c7a6b; margin: 0;">NeuroTrack</h2>
          </div>
          
          <h3 style="color: #333;">¡Cuenta Activada! 🎉</h3>
          <p style="color: #666; font-size: 16px;">
            Tu cédula profesional ha sido verificada exitosamente por nuestro equipo.
          </p>
          
          <p style="color: #666; font-size: 16px;">
            Ahora puedes iniciar sesión en NeuroTrack y comenzar a gestionar 
            a tus pacientes con Parkinson.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${(process.env.FRONTEND_URL || '').trim()}/login" 
               style="display: inline-block; padding: 15px 30px; background-color: #2c7a6b; 
                      color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Iniciar Sesión
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            NeuroTrack - Plataforma de monitoreo para pacientes con Parkinson<br>
            © 2024 Todos los derechos reservados
          </p>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email de activación enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error enviando email de activación:', error.message);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error command:', error.command);
    throw error;
  }
}

module.exports = { enviarCodigoVerificacion, enviarEmailActivacion };
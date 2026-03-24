const sgMail = require('@sendgrid/mail');

// Configurar SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

console.log('📧 [Email Debug] Usando SendGrid');
console.log('📧 [Email Debug] FROM: neurotrack@sendgrid.net');

/**
 * Envía email con código de verificación
 */
async function enviarCodigoVerificacion(correo, codigo) {
  try {
    const msg = {
      to: correo,
      from: 'neurotrack@sendgrid.net',
      replyTo: 'manuelmendoza101003@gmail.com',
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
    
    const response = await sgMail.send(msg);
    console.log('✅ Email de verificación enviado:', response[0].statusCode);
    return response;
  } catch (error) {
    console.error('❌ Error enviando email de verificación:', error.message);
    if (error.response) {
      console.error('❌ Detalles:', error.response.body);
    }
    throw error;
  }
}

/**
 * Envía email de cuenta activada
 */
async function enviarEmailActivacion(correo) {
  try {
    const msg = {
      to: correo,
      from: 'neurotrack@sendgrid.net',
      replyTo: 'manuelmendoza101003@gmail.com',
      subject: 'Tu cuenta NeuroTrack ha sido activada',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #2c7a6b; margin: 0;">NeuroTrack</h2>
          </div>
          
          <h3 style="color: #333;">¡Cuenta Activada! 🎉</h3>
          <p style="color: #666; font-size: 16px;">
            Tu cuenta ha sido verificada exitosamente por nuestro equipo.
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
    
    const response = await sgMail.send(msg);
    console.log('✅ Email de activación enviado:', response[0].statusCode);
    return response;
  } catch (error) {
    console.error('❌ Error enviando email de activación:', error.message);
    if (error.response) {
      console.error('❌ Detalles:', error.response.body);
    }
    throw error;
  }
}

module.exports = { enviarCodigoVerificacion, enviarEmailActivacion };
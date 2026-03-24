const pool = require('../config/database');
const { hashPassword, verifyPassword } = require('../utils/password');
const { generarCodigoVerificacion } = require('../utils/codigo');
const { enviarCodigoVerificacion } = require('../services/email.service');

// ─────────────────────────────────────────────
// GET /api/perfil
// ─────────────────────────────────────────────
async function obtenerPerfil(req, res) {
  try {
    const doctorId = req.doctor.id;

    const result = await pool.query(
      `SELECT
        d.id,
        d.nombre_completo,
        d.correo,
        d.cedula_profesional,
        d.telefono,
        d.especialidad,
        d.institucion_procedencia,
        d.biografia_breve,
        d.codigo_vinculacion,
        d.mostrar_cedula,
        d.mostrar_especialidad,
        d.mostrar_biografia,
        d.mostrar_correo,
        d.mostrar_telefono_personal,
        d.created_at,
        d.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id',                       c.id,
              'nombre_institucion',       c.nombre_institucion,
              'es_consultorio_particular',c.es_consultorio_particular,
              'calle',                    c.calle,
              'numero_exterior',          c.numero_exterior,
              'numero_interior',          c.numero_interior,
              'colonia',                  c.colonia,
              'codigo_postal',            c.codigo_postal,
              'ciudad',                   c.ciudad,
              'estado',                   c.estado,
              'pais',                     c.pais,
              'telefono_cita',            c.telefono_cita,
              'email_consultorio',        c.email_consultorio,
              'horario_atencion',         c.horario_atencion,
              'activo',                   c.activo,
              'es_principal',             c.es_principal,
              'visible_para_pacientes',   c.visible_para_pacientes,
              'mostrar_direccion_completa', c.mostrar_direccion_completa,
              'mostrar_telefono_cita',    c.mostrar_telefono_cita,
              'mostrar_horario',          c.mostrar_horario
            )
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'
        ) AS consultorios
      FROM doctores d
      LEFT JOIN consultorios c ON c.doctor_id = d.id
      WHERE d.id = $1
      GROUP BY d.id`,
      [doctorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Doctor no encontrado'
      });
    }

    res.json({ success: true, data: result.rows[0] });

  } catch (error) {
    console.error('Error en obtenerPerfil:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// PUT /api/perfil
// ─────────────────────────────────────────────
async function editarPerfil(req, res) {
  try {
    const doctorId = req.doctor.id;
    const {
      nombre_completo,
      telefono,
      especialidad,
      institucion_procedencia,
      biografia_breve,
      mostrar_cedula,
      mostrar_especialidad,
      mostrar_biografia,
      mostrar_correo,
      mostrar_telefono_personal
    } = req.body;

    if (nombre_completo !== undefined) {
      if (!nombre_completo || nombre_completo.trim().length < 5) {
        return res.status(400).json({
          success: false,
          message: 'El nombre completo debe tener al menos 5 caracteres'
        });
      }
    }

    const result = await pool.query(
      `UPDATE doctores SET
        nombre_completo           = COALESCE($1,  nombre_completo),
        telefono                  = COALESCE($2,  telefono),
        especialidad              = COALESCE($3,  especialidad),
        institucion_procedencia   = COALESCE($4,  institucion_procedencia),
        biografia_breve           = COALESCE($5,  biografia_breve),
        mostrar_cedula            = COALESCE($6,  mostrar_cedula),
        mostrar_especialidad      = COALESCE($7,  mostrar_especialidad),
        mostrar_biografia         = COALESCE($8,  mostrar_biografia),
        mostrar_correo            = COALESCE($9,  mostrar_correo),
        mostrar_telefono_personal = COALESCE($10, mostrar_telefono_personal),
        updated_at                = NOW()
      WHERE id = $11
      RETURNING
        id, nombre_completo, correo, telefono, especialidad,
        institucion_procedencia, biografia_breve,
        mostrar_cedula, mostrar_especialidad, mostrar_biografia,
        mostrar_correo, mostrar_telefono_personal, updated_at`,
      [
        nombre_completo?.trim()        || null,
        telefono                       || null,
        especialidad                   || null,
        institucion_procedencia?.trim()|| null,
        biografia_breve?.trim()        || null,
        mostrar_cedula                 ?? null,
        mostrar_especialidad           ?? null,
        mostrar_biografia              ?? null,
        mostrar_correo                 ?? null,
        mostrar_telefono_personal      ?? null,
        doctorId
      ]
    );

    res.json({
      success: true,
      message: 'Perfil actualizado correctamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error en editarPerfil:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// POST /api/perfil/cambiar-correo
// Paso 1: envía código al NUEVO correo
// ─────────────────────────────────────────────
async function solicitarCambioCorreo(req, res) {
  try {
    const doctorId = req.doctor.id;
    const { nuevo_correo, password } = req.body;

    if (!nuevo_correo || !password) {
      return res.status(400).json({
        success: false,
        message: 'nuevo_correo y password son requeridos'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(nuevo_correo)) {
      return res.status(400).json({
        success: false,
        message: 'El formato del correo no es válido'
      });
    }

    // Verificar password actual
    const doctorResult = await pool.query(
      'SELECT password_hash, correo FROM doctores WHERE id = $1',
      [doctorId]
    );
    const doctor = doctorResult.rows[0];

    const passwordValido = await verifyPassword(password, doctor.password_hash);
    if (!passwordValido) {
      return res.status(401).json({
        success: false,
        message: 'Contraseña incorrecta'
      });
    }

    if (nuevo_correo.toLowerCase() === doctor.correo.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: 'El nuevo correo debe ser diferente al actual'
      });
    }

    // Verificar que el nuevo correo no esté en uso
    const correoEnUso = await pool.query(
      'SELECT id FROM doctores WHERE correo = $1 AND id != $2',
      [nuevo_correo, doctorId]
    );
    if (correoEnUso.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Ese correo ya está registrado por otra cuenta'
      });
    }

    const codigo = generarCodigoVerificacion();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `UPDATE doctores SET
        pending_correo            = $1,
        pending_correo_code       = $2,
        pending_correo_expires_at = $3
       WHERE id = $4`,
      [nuevo_correo, codigo, expiresAt, doctorId]
    );

    await enviarCodigoVerificacion(nuevo_correo, codigo);

    res.json({
      success: true,
      message: `Código de verificación enviado a ${nuevo_correo}. Expira en 15 minutos.`
    });

  } catch (error) {
    console.error('Error en solicitarCambioCorreo:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// POST /api/perfil/confirmar-correo
// Paso 2: confirmar con el código recibido
// ─────────────────────────────────────────────
async function confirmarCambioCorreo(req, res) {
  try {
    const doctorId = req.doctor.id;
    const { codigo } = req.body;

    if (!codigo || !/^\d{6}$/.test(codigo)) {
      return res.status(400).json({
        success: false,
        message: 'El código debe ser de 6 dígitos numéricos'
      });
    }

    const result = await pool.query(
      `SELECT pending_correo, pending_correo_code, pending_correo_expires_at
       FROM doctores WHERE id = $1`,
      [doctorId]
    );
    const doctor = result.rows[0];

    if (!doctor.pending_correo || !doctor.pending_correo_code) {
      return res.status(400).json({
        success: false,
        message: 'No hay un cambio de correo pendiente. Solicita uno nuevo.'
      });
    }

    if (new Date() > new Date(doctor.pending_correo_expires_at)) {
      return res.status(400).json({
        success: false,
        message: 'El código ha expirado. Solicita el cambio nuevamente.'
      });
    }

    if (doctor.pending_correo_code !== codigo) {
      return res.status(400).json({
        success: false,
        message: 'Código incorrecto'
      });
    }

    await pool.query(
      `UPDATE doctores SET
        correo                    = pending_correo,
        pending_correo            = NULL,
        pending_correo_code       = NULL,
        pending_correo_expires_at = NULL,
        updated_at                = NOW()
       WHERE id = $1`,
      [doctorId]
    );

    res.json({
      success: true,
      message: 'Correo actualizado correctamente. Inicia sesión con tu nuevo correo.',
      data: { nuevo_correo: doctor.pending_correo }
    });

  } catch (error) {
    console.error('Error en confirmarCambioCorreo:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// POST /api/perfil/cambiar-password
// ─────────────────────────────────────────────
async function cambiarPassword(req, res) {
  try {
    const doctorId = req.doctor.id;
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({
        success: false,
        message: 'password_actual y password_nueva son requeridos'
      });
    }

    if (password_nueva.length < 8 || password_nueva.length > 12) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe tener entre 8 y 12 caracteres'
      });
    }

    const result = await pool.query(
      'SELECT password_hash FROM doctores WHERE id = $1',
      [doctorId]
    );

    const passwordValido = await verifyPassword(password_actual, result.rows[0].password_hash);
    if (!passwordValido) {
      return res.status(401).json({
        success: false,
        message: 'La contraseña actual es incorrecta'
      });
    }

    if (password_actual === password_nueva) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe ser diferente a la actual'
      });
    }

    const nuevo_hash = await hashPassword(password_nueva);

    await pool.query(
      'UPDATE doctores SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [nuevo_hash, doctorId]
    );

    res.json({
      success: true,
      message: 'Contraseña actualizada correctamente'
    });

  } catch (error) {
    console.error('Error en cambiarPassword:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// GET /api/perfil/consultorios
// ─────────────────────────────────────────────
async function listarConsultorios(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM consultorios
       WHERE doctor_id = $1
       ORDER BY es_principal DESC, created_at ASC`,
      [req.doctor.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error en listarConsultorios:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// POST /api/perfil/consultorios
// ─────────────────────────────────────────────
async function crearConsultorio(req, res) {
  const client = await pool.connect();
  try {
    const doctorId = req.doctor.id;
    const {
      nombre_institucion,
      es_consultorio_particular   = false,
      calle, numero_exterior, numero_interior,
      colonia, codigo_postal, ciudad, estado, pais = 'México',
      telefono_cita, email_consultorio,
      horario_atencion, reglas_agenda,
      es_principal                = false,
      visible_para_pacientes      = true,
      mostrar_direccion_completa  = false,
      mostrar_telefono_cita       = true,
      mostrar_horario             = true,
      mostrar_reglas_agenda       = true
    } = req.body;

    if (!nombre_institucion && !es_consultorio_particular) {
      return res.status(400).json({
        success: false,
        message: 'nombre_institucion es requerido si no es consultorio particular'
      });
    }

    await client.query('BEGIN');

    // Si será principal, quitar el flag a los demás
    if (es_principal) {
      await client.query(
        'UPDATE consultorios SET es_principal = FALSE WHERE doctor_id = $1',
        [doctorId]
      );
    }

    // Construir dirección completa
    const direccion_completa = [
      calle,
      numero_exterior          ? `#${numero_exterior}` : null,
      numero_interior          ? `Int. ${numero_interior}` : null,
      colonia, ciudad, estado, codigo_postal, pais
    ].filter(Boolean).join(', ');

    const result = await client.query(
      `INSERT INTO consultorios (
        doctor_id, nombre_institucion, es_consultorio_particular,
        calle, numero_exterior, numero_interior, colonia,
        codigo_postal, ciudad, estado, pais, direccion_completa,
        telefono_cita, email_consultorio, horario_atencion,
        reglas_agenda, es_principal, activo,
        visible_para_pacientes, mostrar_direccion_completa,
        mostrar_telefono_cita, mostrar_horario, mostrar_reglas_agenda
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,TRUE,$18,$19,$20,$21,$22
      ) RETURNING *`,
      [
        doctorId, nombre_institucion, es_consultorio_particular,
        calle, numero_exterior, numero_interior, colonia,
        codigo_postal, ciudad, estado, pais, direccion_completa,
        telefono_cita, email_consultorio, horario_atencion,
        reglas_agenda ? JSON.stringify(reglas_agenda) : null,
        es_principal,
        visible_para_pacientes, mostrar_direccion_completa,
        mostrar_telefono_cita, mostrar_horario, mostrar_reglas_agenda
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Consultorio creado correctamente',
      data: result.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en crearConsultorio:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────
// GET /api/perfil/consultorios/:id
// ─────────────────────────────────────────────
async function obtenerConsultorio(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM consultorios WHERE id = $1 AND doctor_id = $2',
      [req.params.id, req.doctor.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Consultorio no encontrado o no pertenece a tu cuenta'
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error en obtenerConsultorio:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// PUT /api/perfil/consultorios/:id
// ─────────────────────────────────────────────
async function editarConsultorio(req, res) {
  const client = await pool.connect();
  try {
    const doctorId = req.doctor.id;
    const { id } = req.params;

    // Verificar propiedad
    const existe = await client.query(
      'SELECT * FROM consultorios WHERE id = $1 AND doctor_id = $2',
      [id, doctorId]
    );
    if (existe.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Consultorio no encontrado o no pertenece a tu cuenta'
      });
    }

    const actual = existe.rows[0];
    const {
      nombre_institucion, es_consultorio_particular,
      calle, numero_exterior, numero_interior,
      colonia, codigo_postal, ciudad, estado, pais,
      telefono_cita, email_consultorio,
      horario_atencion, reglas_agenda, es_principal
    } = req.body;

    await client.query('BEGIN');

    if (es_principal === true) {
      await client.query(
        'UPDATE consultorios SET es_principal = FALSE WHERE doctor_id = $1 AND id != $2',
        [doctorId, id]
      );
    }

    // Reconstruir dirección solo si viene algún campo de dirección
    const hayDireccion = calle || ciudad || estado || colonia || codigo_postal;
    const direccion_completa = hayDireccion
      ? [
          calle              ?? actual.calle,
          (numero_exterior   ?? actual.numero_exterior)  ? `#${numero_exterior ?? actual.numero_exterior}` : null,
          (numero_interior   ?? actual.numero_interior)  ? `Int. ${numero_interior ?? actual.numero_interior}` : null,
          colonia            ?? actual.colonia,
          ciudad             ?? actual.ciudad,
          estado             ?? actual.estado,
          codigo_postal      ?? actual.codigo_postal,
          pais               ?? actual.pais
        ].filter(Boolean).join(', ')
      : null;

    const result = await client.query(
      `UPDATE consultorios SET
        nombre_institucion        = COALESCE($1,  nombre_institucion),
        es_consultorio_particular = COALESCE($2,  es_consultorio_particular),
        calle                     = COALESCE($3,  calle),
        numero_exterior           = COALESCE($4,  numero_exterior),
        numero_interior           = COALESCE($5,  numero_interior),
        colonia                   = COALESCE($6,  colonia),
        codigo_postal             = COALESCE($7,  codigo_postal),
        ciudad                    = COALESCE($8,  ciudad),
        estado                    = COALESCE($9,  estado),
        pais                      = COALESCE($10, pais),
        direccion_completa        = COALESCE($11, direccion_completa),
        telefono_cita             = COALESCE($12, telefono_cita),
        email_consultorio         = COALESCE($13, email_consultorio),
        horario_atencion          = COALESCE($14, horario_atencion),
        reglas_agenda             = COALESCE($15, reglas_agenda),
        es_principal              = COALESCE($16, es_principal),
        updated_at                = NOW()
      WHERE id = $17 AND doctor_id = $18
      RETURNING *`,
      [
        nombre_institucion, es_consultorio_particular,
        calle, numero_exterior, numero_interior,
        colonia, codigo_postal, ciudad, estado, pais,
        direccion_completa,
        telefono_cita, email_consultorio, horario_atencion,
        reglas_agenda ? JSON.stringify(reglas_agenda) : null,
        es_principal ?? null,
        id, doctorId
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Consultorio actualizado correctamente',
      data: result.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en editarConsultorio:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────
// DELETE /api/perfil/consultorios/:id
// ─────────────────────────────────────────────
async function eliminarConsultorio(req, res) {
  try {
    const result = await pool.query(
      `DELETE FROM consultorios
       WHERE id = $1 AND doctor_id = $2
       RETURNING id, nombre_institucion`,
      [req.params.id, req.doctor.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Consultorio no encontrado o no pertenece a tu cuenta'
      });
    }

    res.json({
      success: true,
      message: `Consultorio "${result.rows[0].nombre_institucion}" eliminado correctamente`
    });
  } catch (error) {
    console.error('Error en eliminarConsultorio:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// PUT /api/perfil/consultorios/:id/visibilidad
// ─────────────────────────────────────────────
async function actualizarVisibilidadConsultorio(req, res) {
  try {
    const { id } = req.params;
    const {
      visible_para_pacientes,
      mostrar_direccion_completa,
      mostrar_telefono_cita,
      mostrar_horario,
      mostrar_reglas_agenda
    } = req.body;

    const result = await pool.query(
      `UPDATE consultorios SET
        visible_para_pacientes     = COALESCE($1, visible_para_pacientes),
        mostrar_direccion_completa = COALESCE($2, mostrar_direccion_completa),
        mostrar_telefono_cita      = COALESCE($3, mostrar_telefono_cita),
        mostrar_horario            = COALESCE($4, mostrar_horario),
        mostrar_reglas_agenda      = COALESCE($5, mostrar_reglas_agenda),
        updated_at                 = NOW()
      WHERE id = $6 AND doctor_id = $7
      RETURNING
        id, visible_para_pacientes, mostrar_direccion_completa,
        mostrar_telefono_cita, mostrar_horario, mostrar_reglas_agenda`,
      [
        visible_para_pacientes     ?? null,
        mostrar_direccion_completa ?? null,
        mostrar_telefono_cita      ?? null,
        mostrar_horario            ?? null,
        mostrar_reglas_agenda      ?? null,
        id, req.doctor.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Consultorio no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Visibilidad del consultorio actualizada',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error en actualizarVisibilidadConsultorio:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// GET /api/perfil/notificaciones
// ─────────────────────────────────────────────
async function obtenerNotificaciones(req, res) {
  try {
    const doctorId = req.doctor.id;

    // Crea el registro con defaults si no existe
    await pool.query(
      `INSERT INTO notificacion_preferencias (doctor_id)
       VALUES ($1)
       ON CONFLICT (doctor_id) DO NOTHING`,
      [doctorId]
    );

    const result = await pool.query(
      'SELECT * FROM notificacion_preferencias WHERE doctor_id = $1',
      [doctorId]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error en obtenerNotificaciones:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// PUT /api/perfil/notificaciones
// ─────────────────────────────────────────────
async function actualizarNotificaciones(req, res) {
  try {
    const doctorId = req.doctor.id;
    const {
      email_nuevos_pacientes,
      email_citas,
      email_recordatorios,
      push_nuevos_pacientes,
      push_citas,
      push_recordatorios,
      push_token
    } = req.body;

    const result = await pool.query(
      `INSERT INTO notificacion_preferencias (
        doctor_id,
        email_nuevos_pacientes, email_citas, email_recordatorios,
        push_nuevos_pacientes,  push_citas,  push_recordatorios, push_token
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (doctor_id) DO UPDATE SET
        email_nuevos_pacientes = COALESCE($2, notificacion_preferencias.email_nuevos_pacientes),
        email_citas            = COALESCE($3, notificacion_preferencias.email_citas),
        email_recordatorios    = COALESCE($4, notificacion_preferencias.email_recordatorios),
        push_nuevos_pacientes  = COALESCE($5, notificacion_preferencias.push_nuevos_pacientes),
        push_citas             = COALESCE($6, notificacion_preferencias.push_citas),
        push_recordatorios     = COALESCE($7, notificacion_preferencias.push_recordatorios),
        push_token             = COALESCE($8, notificacion_preferencias.push_token),
        updated_at             = NOW()
       RETURNING *`,
      [
        doctorId,
        email_nuevos_pacientes ?? null,
        email_citas            ?? null,
        email_recordatorios    ?? null,
        push_nuevos_pacientes  ?? null,
        push_citas             ?? null,
        push_recordatorios     ?? null,
        push_token             ?? null
      ]
    );

    res.json({
      success: true,
      message: 'Preferencias de notificaciones actualizadas',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error en actualizarNotificaciones:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

module.exports = {
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
};
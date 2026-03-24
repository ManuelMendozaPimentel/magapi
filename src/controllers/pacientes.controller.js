const pool = require('../config/database');

// ─────────────────────────────────────────────
// GET /api/pacientes
// Lista todos los pacientes vinculados al doctor
// con sus datos clínicos ya combinados
// ─────────────────────────────────────────────
async function listarPacientes(req, res) {
  try {
    const doctorId = req.doctor.id;

    const result = await pool.query(
      `SELECT
        p.id,
        p.nombre_completo,
        p.correo,
        p.telefono,
        p.fecha_nacimiento,
        EXTRACT(YEAR FROM AGE(p.fecha_nacimiento))::INTEGER AS edad,
        dp.fecha_vinculacion,
        dp.activo,
        -- Datos clínicos que agregó este doctor
        dc.diagnostico,
        dc.estadio_hoehn_yahr,
        dc.medicamentos,
        dc.notas_clinicas
      FROM doctores_pacientes dp
      JOIN pacientes p ON p.id = dp.paciente_id
      LEFT JOIN datos_clinicos dc
        ON dc.paciente_id = p.id AND dc.doctor_id = $1
      WHERE dp.doctor_id = $1
        AND dp.activo = TRUE
      ORDER BY dp.fecha_vinculacion DESC`,
      [doctorId]
    );

    res.json({
      success: true,
      data: result.rows,
      total: result.rowCount
    });

  } catch (error) {
    console.error('Error en listarPacientes:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// GET /api/pacientes/:id
// Detalle completo de un paciente vinculado
// ─────────────────────────────────────────────
async function obtenerPaciente(req, res) {
  try {
    const doctorId = req.doctor.id;
    const pacienteId = req.params.id;

    // Verificar que el paciente esté vinculado a este doctor
    const vinculacion = await pool.query(
      `SELECT dp.id FROM doctores_pacientes dp
       WHERE dp.doctor_id = $1
         AND dp.paciente_id = $2
         AND dp.activo = TRUE`,
      [doctorId, pacienteId]
    );

    if (vinculacion.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Paciente no encontrado o no está vinculado a tu cuenta'
      });
    }

    const result = await pool.query(
      `SELECT
        p.id,
        p.nombre_completo,
        p.correo,
        p.telefono,
        p.fecha_nacimiento,
        EXTRACT(YEAR FROM AGE(p.fecha_nacimiento))::INTEGER AS edad,
        dp.fecha_vinculacion,
        dc.diagnostico,
        dc.estadio_hoehn_yahr,
        dc.medicamentos,
        dc.notas_clinicas,
        dc.updated_at AS datos_clinicos_actualizados
      FROM pacientes p
      JOIN doctores_pacientes dp
        ON dp.paciente_id = p.id AND dp.doctor_id = $1
      LEFT JOIN datos_clinicos dc
        ON dc.paciente_id = p.id AND dc.doctor_id = $1
      WHERE p.id = $2`,
      [doctorId, pacienteId]
    );

    res.json({ success: true, data: result.rows[0] });

  } catch (error) {
    console.error('Error en obtenerPaciente:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// PUT /api/pacientes/:id/datos-clinicos
// El doctor agrega o actualiza diagnóstico,
// estadio y medicamentos de su paciente.
// Usa UPSERT para crear si no existe.
// ─────────────────────────────────────────────
async function actualizarDatosClinicos(req, res) {
  try {
    const doctorId  = req.doctor.id;
    const pacienteId = req.params.id;

    const {
      diagnostico,
      estadio_hoehn_yahr,
      medicamentos,
      notas_clinicas
    } = req.body;

    // Validar que el paciente esté vinculado
    const vinculacion = await pool.query(
      `SELECT id FROM doctores_pacientes
       WHERE doctor_id = $1 AND paciente_id = $2 AND activo = TRUE`,
      [doctorId, pacienteId]
    );

    if (vinculacion.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Paciente no encontrado o no está vinculado a tu cuenta'
      });
    }

    // Validar estadio si viene
    const estadiosValidos = ['I', 'II', 'III', 'IV', 'V'];
    if (estadio_hoehn_yahr && !estadiosValidos.includes(estadio_hoehn_yahr)) {
      return res.status(400).json({
        success: false,
        message: `Estadio inválido. Valores permitidos: ${estadiosValidos.join(', ')}`
      });
    }

    // UPSERT — crea el registro si no existe, actualiza si ya existe
    const result = await pool.query(
      `INSERT INTO datos_clinicos (
        paciente_id, doctor_id,
        diagnostico, estadio_hoehn_yahr, medicamentos, notas_clinicas
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (paciente_id, doctor_id) DO UPDATE SET
        diagnostico        = COALESCE($3, datos_clinicos.diagnostico),
        estadio_hoehn_yahr = COALESCE($4, datos_clinicos.estadio_hoehn_yahr),
        medicamentos       = COALESCE($5, datos_clinicos.medicamentos),
        notas_clinicas     = COALESCE($6, datos_clinicos.notas_clinicas),
        updated_at         = NOW()
       RETURNING *`,
      [
        pacienteId,
        doctorId,
        diagnostico        || null,
        estadio_hoehn_yahr || null,
        medicamentos       ? JSON.stringify(medicamentos) : null,
        notas_clinicas     || null
      ]
    );

    res.json({
      success: true,
      message: 'Datos clínicos actualizados correctamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error en actualizarDatosClinicos:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/pacientes/:id/vincular
// Desvincula al paciente (soft delete).
// El paciente sigue existiendo en el sistema
// y puede seguir con otros doctores.
// ─────────────────────────────────────────────
async function desvincularPaciente(req, res) {
  try {
    const doctorId  = req.doctor.id;
    const pacienteId = req.params.id;
    const { motivo } = req.body; // opcional

    const result = await pool.query(
      `UPDATE doctores_pacientes SET
        activo                = FALSE,
        fecha_desvinculacion  = NOW(),
        motivo_desvinculacion = $3
       WHERE doctor_id = $1
         AND paciente_id = $2
         AND activo = TRUE
       RETURNING id`,
      [doctorId, pacienteId, motivo || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Paciente no encontrado o ya estaba desvinculado'
      });
    }

    res.json({
      success: true,
      message: 'Paciente desvinculado correctamente'
    });

  } catch (error) {
    console.error('Error en desvincularPaciente:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

module.exports = {
  listarPacientes,
  obtenerPaciente,
  actualizarDatosClinicos,
  desvincularPaciente
};
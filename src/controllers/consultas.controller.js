const pool = require('../config/database');

// ─────────────────────────────────────────────
// POST /api/consultas
// Crea la consulta y sus medicamentos en una
// sola transacción. Si algo falla, revierte todo.
// AHORA CON SOPORTE PARA UPDRS
// ─────────────────────────────────────────────
async function crearConsulta(req, res) {
  const client = await pool.connect();

  try {
    const doctorId = req.doctor.id;
    const {
      paciente_id,
      motivo_consulta,
      diagnostico,
      plan_tratamiento,
      indicaciones,
      proxima_cita,
      // Signos vitales
      peso,
      talla,
      imc,
      presion_arterial,
      frecuencia_cardiaca,
      temperatura,
      glucosa,
      // UPDRS (nuevos campos)
      updrs_parte1,
      updrs_parte2,
      updrs_parte3,
      updrs_parte4,
      // Array de medicamentos
      medicamentos = []
    } = req.body;

    // Validaciones básicas
    if (!paciente_id) {
      return res.status(400).json({
        success: false,
        message: 'paciente_id es requerido'
      });
    }

    if (!motivo_consulta?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El motivo de consulta es requerido'
      });
    }

    if (!diagnostico?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El diagnóstico es requerido'
      });
    }

    if (!medicamentos.length || !medicamentos.some(m => m.nombre?.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Debe incluir al menos un medicamento con nombre'
      });
    }

    // Validar rangos UPDRS si vienen
    const validarUpdrs = (valor, min, max, nombre) => {
      if (valor !== undefined && valor !== null) {
        if (valor < min || valor > max) {
          throw new Error(`${nombre} debe estar entre ${min} y ${max}`);
        }
      }
    };

    try {
      validarUpdrs(updrs_parte1, 0, 52, 'UPDRS Parte I');
      validarUpdrs(updrs_parte2, 0, 52, 'UPDRS Parte II');
      validarUpdrs(updrs_parte3, 0, 132, 'UPDRS Parte III');
      validarUpdrs(updrs_parte4, 0, 23, 'UPDRS Parte IV');
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Calcular UPDRS total si al menos una parte viene
    let updrs_total = null;
    if (updrs_parte1 !== undefined || updrs_parte2 !== undefined || 
        updrs_parte3 !== undefined || updrs_parte4 !== undefined) {
      updrs_total = (updrs_parte1 || 0) + (updrs_parte2 || 0) + 
                    (updrs_parte3 || 0) + (updrs_parte4 || 0);
    }

    // Verificar que el paciente esté vinculado al doctor
    const vinculacion = await client.query(
      `SELECT id FROM doctores_pacientes
       WHERE doctor_id = $1 AND paciente_id = $2 AND activo = TRUE`,
      [doctorId, paciente_id]
    );

    if (vinculacion.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Paciente no encontrado o no está vinculado a tu cuenta'
      });
    }

    await client.query('BEGIN');

    // 1. Insertar la consulta (con UPDRS)
    const consultaResult = await client.query(
      `INSERT INTO consultas (
        doctor_id, paciente_id,
        motivo_consulta, diagnostico, plan_tratamiento, indicaciones,
        peso, talla, imc, presion_arterial,
        frecuencia_cardiaca, temperatura, glucosa,
        proxima_cita,
        updrs_parte1, updrs_parte2, updrs_parte3, updrs_parte4, updrs_total
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13,
        $14,
        $15, $16, $17, $18, $19
      ) RETURNING id, created_at`,
      [
        doctorId,
        paciente_id,
        motivo_consulta.trim(),
        diagnostico.trim(),
        plan_tratamiento?.trim() || null,
        indicaciones?.trim() || null,
        peso || null,
        talla || null,
        imc || null,
        presion_arterial || null,
        frecuencia_cardiaca || null,
        temperatura || null,
        glucosa || null,
        proxima_cita || null,
        updrs_parte1 !== undefined ? updrs_parte1 : null,
        updrs_parte2 !== undefined ? updrs_parte2 : null,
        updrs_parte3 !== undefined ? updrs_parte3 : null,
        updrs_parte4 !== undefined ? updrs_parte4 : null,
        updrs_total
      ]
    );

    const consulta = consultaResult.rows[0];

    // 2. Insertar medicamentos (solo los que tienen nombre)
    const medsValidos = medicamentos.filter(m => m.nombre?.trim());

    for (const med of medsValidos) {
      await client.query(
        `INSERT INTO consulta_medicamentos
           (consulta_id, nombre, dosis, frecuencia, duracion)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          consulta.id,
          med.nombre.trim(),
          med.dosis || null,
          med.frecuencia || null,
          med.duracion || null
        ]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Consulta registrada correctamente',
      data: {
        id: consulta.id,
        created_at: consulta.created_at,
        paciente_id,
        diagnostico: diagnostico.trim(),
        medicamentos: medsValidos.length,
        updrs_total: updrs_total
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en crearConsulta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────
// GET /api/consultas
// Últimas consultas del doctor (todas sus pacientes)
// ─────────────────────────────────────────────
async function listarConsultasDoctor(req, res) {
  try {
    const doctorId = req.doctor.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT
        c.id,
        c.created_at,
        c.diagnostico,
        c.motivo_consulta,
        c.proxima_cita,
        c.updrs_total,
        p.id           AS paciente_id,
        p.nombre_completo AS paciente_nombre,
        p.correo       AS paciente_correo,
        COUNT(cm.id)::INTEGER AS total_medicamentos
      FROM consultas c
      JOIN pacientes p ON p.id = c.paciente_id
      LEFT JOIN consulta_medicamentos cm ON cm.consulta_id = c.id
      WHERE c.doctor_id = $1
      GROUP BY c.id, p.id
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3`,
      [doctorId, limit, offset]
    );

    const totalResult = await pool.query(
      'SELECT COUNT(*)::INTEGER AS total FROM consultas WHERE doctor_id = $1',
      [doctorId]
    );

    res.json({
      success: true,
      data: result.rows,
      total: totalResult.rows[0].total,
      limit,
      offset
    });

  } catch (error) {
    console.error('Error en listarConsultasDoctor:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

// ─────────────────────────────────────────────
// GET /api/consultas/paciente/:pacienteId
// Todas las consultas de un paciente específico
// ─────────────────────────────────────────────
async function listarConsultasPaciente(req, res) {
  try {
    const doctorId = req.doctor.id;
    const pacienteId = req.params.pacienteId;

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

    const result = await pool.query(
      `SELECT
        c.id,
        c.created_at,
        c.motivo_consulta,
        c.diagnostico,
        c.plan_tratamiento,
        c.indicaciones,
        c.proxima_cita,
        c.updrs_parte1,
        c.updrs_parte2,
        c.updrs_parte3,
        c.updrs_parte4,
        c.updrs_total,
        c.peso, c.talla, c.imc,
        c.presion_arterial, c.frecuencia_cardiaca,
        c.temperatura, c.glucosa,
        COALESCE(
          json_agg(
            json_build_object(
              'id',         cm.id,
              'nombre',     cm.nombre,
              'dosis',      cm.dosis,
              'frecuencia', cm.frecuencia,
              'duracion',   cm.duracion
            )
          ) FILTER (WHERE cm.id IS NOT NULL),
          '[]'
        ) AS medicamentos
      FROM consultas c
      LEFT JOIN consulta_medicamentos cm ON cm.consulta_id = c.id
      WHERE c.doctor_id = $1 AND c.paciente_id = $2
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
      [doctorId, pacienteId]
    );

    res.json({
      success: true,
      data: result.rows,
      total: result.rowCount
    });

  } catch (error) {
    console.error('Error en listarConsultasPaciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

// ─────────────────────────────────────────────
// GET /api/consultas/:id
// Detalle completo de una consulta específica
// ─────────────────────────────────────────────
async function obtenerConsulta(req, res) {
  try {
    const doctorId = req.doctor.id;
    const consultaId = req.params.id;

    const result = await pool.query(
      `SELECT
        c.id,
        c.created_at,
        c.motivo_consulta,
        c.diagnostico,
        c.plan_tratamiento,
        c.indicaciones,
        c.proxima_cita,
        -- Signos vitales
        c.peso, c.talla, c.imc,
        c.presion_arterial,
        c.frecuencia_cardiaca,
        c.temperatura,
        c.glucosa,
        -- UPDRS
        c.updrs_parte1,
        c.updrs_parte2,
        c.updrs_parte3,
        c.updrs_parte4,
        c.updrs_total,
        -- Datos del paciente
        p.id              AS paciente_id,
        p.nombre_completo AS paciente_nombre,
        p.correo          AS paciente_correo,
        p.telefono        AS paciente_telefono,
        p.fecha_nacimiento,
        EXTRACT(YEAR FROM AGE(p.fecha_nacimiento))::INTEGER AS paciente_edad,
        -- Datos clínicos base del paciente (para contexto)
        dc.diagnostico        AS diagnostico_base,
        dc.estadio_hoehn_yahr AS estadio_base,
        -- Medicamentos recetados
        COALESCE(
          json_agg(
            json_build_object(
              'id',         cm.id,
              'nombre',     cm.nombre,
              'dosis',      cm.dosis,
              'frecuencia', cm.frecuencia,
              'duracion',   cm.duracion
            )
            ORDER BY cm.id
          ) FILTER (WHERE cm.id IS NOT NULL),
          '[]'
        ) AS medicamentos
      FROM consultas c
      JOIN pacientes p  ON p.id  = c.paciente_id
      LEFT JOIN datos_clinicos dc
        ON dc.paciente_id = c.paciente_id AND dc.doctor_id = c.doctor_id
      LEFT JOIN consulta_medicamentos cm ON cm.consulta_id = c.id
      WHERE c.id = $1 AND c.doctor_id = $2
      GROUP BY c.id, p.id, dc.diagnostico, dc.estadio_hoehn_yahr`,
      [consultaId, doctorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Consulta no encontrada o no pertenece a tu cuenta'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error en obtenerConsulta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

module.exports = {
  crearConsulta,
  listarConsultasDoctor,
  listarConsultasPaciente,
  obtenerConsulta
};
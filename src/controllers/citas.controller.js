const pool = require('../config/database');

/**
 * GET /api/citas
 * Listar citas con filtros opcionales
 */
async function listarCitas(req, res) {
  try {
    const doctorId = req.doctor.id;
    const { 
      paciente_id, 
      estado, 
      desde, 
      hasta, 
      fecha,
      limit = 20, 
      offset = 0 
    } = req.query;

    let query = `
      SELECT 
        c.id,
        c.paciente_id,
        p.nombre_completo as paciente_nombre,
        p.correo as paciente_correo,
        p.telefono as paciente_telefono,
        c.fecha_hora,
        c.duracion_minutos,
        c.tipo,
        c.estado,
        c.notas,
        c.motivo_cancelacion,
        c.recordatorio_enviado,
        c.confirmacion_paciente,
        co.id as consultorio_id,
        co.nombre_institucion as consultorio,
        c.created_at,
        c.updated_at
      FROM citas c
      JOIN pacientes p ON p.id = c.paciente_id
      LEFT JOIN consultorios co ON co.id = c.consultorio_id
      WHERE c.doctor_id = $1
    `;

    const params = [doctorId];
    let paramIndex = 2;

    // Filtro por paciente
    if (paciente_id) {
      query += ` AND c.paciente_id = $${paramIndex}`;
      params.push(paciente_id);
      paramIndex++;
    }

    // Filtro por estado
    if (estado) {
      const estadosValidos = ['PROGRAMADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'REPROGRAMADA'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: `Estado no válido. Valores permitidos: ${estadosValidos.join(', ')}`
        });
      }
      query += ` AND c.estado = $${paramIndex}`;
      params.push(estado);
      paramIndex++;
    }

    // Filtro por fecha específica
    if (fecha) {
      query += ` AND DATE(c.fecha_hora) = $${paramIndex}`;
      params.push(fecha);
      paramIndex++;
    }

    // Filtro por rango de fechas
    if (desde) {
      query += ` AND c.fecha_hora >= $${paramIndex}`;
      params.push(desde);
      paramIndex++;
    }
    if (hasta) {
      query += ` AND c.fecha_hora <= $${paramIndex}`;
      params.push(hasta);
      paramIndex++;
    }

    // Ordenar por fecha más cercana primero
    query += ` ORDER BY c.fecha_hora ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Obtener total de registros para paginación
    let countQuery = `
      SELECT COUNT(*)::INTEGER as total 
      FROM citas c
      WHERE c.doctor_id = $1
    `;
    const countParams = [doctorId];
    let countIndex = 2;

    if (paciente_id) {
      countQuery += ` AND c.paciente_id = $${countIndex}`;
      countParams.push(paciente_id);
      countIndex++;
    }
    if (estado) {
      countQuery += ` AND c.estado = $${countIndex}`;
      countParams.push(estado);
      countIndex++;
    }
    if (fecha) {
      countQuery += ` AND DATE(c.fecha_hora) = $${countIndex}`;
      countParams.push(fecha);
      countIndex++;
    }
    if (desde) {
      countQuery += ` AND c.fecha_hora >= $${countIndex}`;
      countParams.push(desde);
      countIndex++;
    }
    if (hasta) {
      countQuery += ` AND c.fecha_hora <= $${countIndex}`;
      countParams.push(hasta);
      countIndex++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = countResult.rows[0].total;

    // Formatear fecha y hora para cada cita
    const citasFormateadas = result.rows.map(cita => ({
      ...cita,
      fecha: new Date(cita.fecha_hora).toISOString().split('T')[0],
      hora: new Date(cita.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    }));

    res.json({
      success: true,
      data: citasFormateadas,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        next_offset: offset + limit < total ? offset + limit : null
      }
    });

  } catch (error) {
    console.error('Error en listarCitas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

/**
 * GET /api/citas/:id
 * Obtener detalle de una cita específica
 */
async function obtenerCita(req, res) {
  try {
    const doctorId = req.doctor.id;
    const citaId = req.params.id;

    const result = await pool.query(
      `SELECT 
        c.id,
        c.paciente_id,
        p.nombre_completo as paciente_nombre,
        p.correo as paciente_correo,
        p.telefono as paciente_telefono,
        p.fecha_nacimiento,
        c.fecha_hora,
        c.duracion_minutos,
        c.tipo,
        c.estado,
        c.notas,
        c.motivo_cancelacion,
        c.recordatorio_enviado,
        c.confirmacion_paciente,
        c.consulta_id,
        co.id as consultorio_id,
        co.nombre_institucion as consultorio,
        co.direccion_completa as consultorio_direccion,
        co.telefono_cita as consultorio_telefono,
        c.created_at,
        c.updated_at
      FROM citas c
      JOIN pacientes p ON p.id = c.paciente_id
      LEFT JOIN consultorios co ON co.id = c.consultorio_id
      WHERE c.id = $1 AND c.doctor_id = $2`,
      [citaId, doctorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cita no encontrada o no pertenece a tu cuenta'
      });
    }

    const cita = result.rows[0];
    cita.fecha = new Date(cita.fecha_hora).toISOString().split('T')[0];
    cita.hora = new Date(cita.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    res.json({
      success: true,
      data: cita
    });

  } catch (error) {
    console.error('Error en obtenerCita:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

/**
 * POST /api/citas
 * Crear nueva cita
 */
async function crearCita(req, res) {
  const client = await pool.connect();
  
  try {
    const doctorId = req.doctor.id;
    const {
      paciente_id,
      consultorio_id,
      fecha_hora,
      duracion_minutos = 30,
      tipo = 'CONSULTA',
      notas
    } = req.body;

    // Validaciones básicas
    if (!paciente_id) {
      return res.status(400).json({
        success: false,
        message: 'paciente_id es requerido'
      });
    }

    if (!fecha_hora) {
      return res.status(400).json({
        success: false,
        message: 'fecha_hora es requerida'
      });
    }

    // Validar que la fecha no sea pasada
    const fechaCita = new Date(fecha_hora);
    if (fechaCita < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'No se pueden agendar citas en fechas pasadas'
      });
    }

    // Validar tipo de cita
    const tiposValidos = ['CONSULTA', 'SEGUIMIENTO', 'URGENCIA', 'ESTUDIO'];
    if (tipo && !tiposValidos.includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: `Tipo no válido. Valores permitidos: ${tiposValidos.join(', ')}`
      });
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

    // Verificar disponibilidad (sin conflictos de horario)
    const fechaInicio = new Date(fecha_hora);
    const fechaFin = new Date(fechaInicio.getTime() + duracion_minutos * 60000);

    const conflicto = await client.query(
      `SELECT id FROM citas
       WHERE doctor_id = $1 
         AND estado IN ('PROGRAMADA', 'CONFIRMADA')
         AND fecha_hora < $2 
         AND fecha_hora + (duracion_minutos || ' minutes')::INTERVAL > $3`,
      [doctorId, fechaFin.toISOString(), fechaInicio.toISOString()]
    );

    if (conflicto.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Ya existe una cita programada en este horario'
      });
    }

    await client.query('BEGIN');

    // Crear la cita
    const result = await client.query(
      `INSERT INTO citas (
        doctor_id, paciente_id, consultorio_id,
        fecha_hora, duracion_minutos, tipo, estado, notas
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PROGRAMADA', $7)
      RETURNING id, fecha_hora, estado`,
      [doctorId, paciente_id, consultorio_id || null, fecha_hora, duracion_minutos, tipo, notas || null]
    );

    await client.query('COMMIT');

    const nuevaCita = result.rows[0];
    nuevaCita.fecha = new Date(nuevaCita.fecha_hora).toISOString().split('T')[0];
    nuevaCita.hora = new Date(nuevaCita.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    res.status(201).json({
      success: true,
      message: 'Cita agendada correctamente',
      data: nuevaCita
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en crearCita:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
}

/**
 * PUT /api/citas/:id
 * Actualizar cita existente
 */
async function actualizarCita(req, res) {
  const client = await pool.connect();
  
  try {
    const doctorId = req.doctor.id;
    const citaId = req.params.id;
    const {
      fecha_hora,
      duracion_minutos,
      tipo,
      consultorio_id,
      notas,
      estado
    } = req.body;

    // Verificar que la cita existe y pertenece al doctor
    const citaExistente = await client.query(
      `SELECT id, estado, fecha_hora FROM citas 
       WHERE id = $1 AND doctor_id = $2`,
      [citaId, doctorId]
    );

    if (citaExistente.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cita no encontrada o no pertenece a tu cuenta'
      });
    }

    const citaActual = citaExistente.rows[0];

    // No permitir modificar citas completadas o canceladas
    if (citaActual.estado === 'COMPLETADA' || citaActual.estado === 'CANCELADA') {
      return res.status(400).json({
        success: false,
        message: `No se puede modificar una cita en estado ${citaActual.estado}`
      });
    }

    // Validar estado si se envía
    if (estado) {
      const estadosValidos = ['PROGRAMADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'REPROGRAMADA'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: `Estado no válido. Valores permitidos: ${estadosValidos.join(', ')}`
        });
      }
    }

    // Si se cambia la fecha/hora, verificar disponibilidad
    if (fecha_hora) {
      const nuevaFecha = new Date(fecha_hora);
      if (nuevaFecha < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'No se pueden reprogramar citas en fechas pasadas'
        });
      }

      const duracion = duracion_minutos || citaActual.duracion_minutos || 30;
      const fechaInicio = new Date(fecha_hora);
      const fechaFin = new Date(fechaInicio.getTime() + duracion * 60000);

      const conflicto = await client.query(
        `SELECT id FROM citas
         WHERE doctor_id = $1 
           AND id != $2
           AND estado IN ('PROGRAMADA', 'CONFIRMADA')
           AND fecha_hora < $3 
           AND fecha_hora + (duracion_minutos || ' minutes')::INTERVAL > $4`,
        [doctorId, citaId, fechaFin.toISOString(), fechaInicio.toISOString()]
      );

      if (conflicto.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe otra cita programada en este horario'
        });
      }
    }

    await client.query('BEGIN');

    // Construir query de actualización dinámica
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (fecha_hora !== undefined) {
      updates.push(`fecha_hora = $${paramIndex++}`);
      values.push(fecha_hora);
    }
    if (duracion_minutos !== undefined) {
      updates.push(`duracion_minutos = $${paramIndex++}`);
      values.push(duracion_minutos);
    }
    if (tipo !== undefined) {
      updates.push(`tipo = $${paramIndex++}`);
      values.push(tipo);
    }
    if (consultorio_id !== undefined) {
      updates.push(`consultorio_id = $${paramIndex++}`);
      values.push(consultorio_id);
    }
    if (notas !== undefined) {
      updates.push(`notas = $${paramIndex++}`);
      values.push(notas);
    }
    if (estado !== undefined) {
      updates.push(`estado = $${paramIndex++}`);
      values.push(estado);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionaron campos para actualizar'
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(citaId, doctorId);

    const result = await client.query(
      `UPDATE citas SET ${updates.join(', ')} 
       WHERE id = $${paramIndex++} AND doctor_id = $${paramIndex}
       RETURNING id, fecha_hora, estado, duracion_minutos, tipo, notas`,
      values
    );

    await client.query('COMMIT');

    const citaActualizada = result.rows[0];
    if (citaActualizada.fecha_hora) {
      citaActualizada.fecha = new Date(citaActualizada.fecha_hora).toISOString().split('T')[0];
      citaActualizada.hora = new Date(citaActualizada.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    }

    res.json({
      success: true,
      message: 'Cita actualizada correctamente',
      data: citaActualizada
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en actualizarCita:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/citas/:id
 * Cancelar cita (soft delete)
 */
async function cancelarCita(req, res) {
  const client = await pool.connect();
  
  try {
    const doctorId = req.doctor.id;
    const citaId = req.params.id;
    const { motivo } = req.query;

    // Verificar que la cita existe
    const citaExistente = await client.query(
      `SELECT id, estado FROM citas 
       WHERE id = $1 AND doctor_id = $2`,
      [citaId, doctorId]
    );

    if (citaExistente.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cita no encontrada o no pertenece a tu cuenta'
      });
    }

    const citaActual = citaExistente.rows[0];

    if (citaActual.estado === 'CANCELADA') {
      return res.status(400).json({
        success: false,
        message: 'Esta cita ya fue cancelada anteriormente'
      });
    }

    if (citaActual.estado === 'COMPLETADA') {
      return res.status(400).json({
        success: false,
        message: 'No se puede cancelar una cita ya completada'
      });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE citas 
       SET estado = 'CANCELADA', 
           motivo_cancelacion = $1,
           updated_at = NOW()
       WHERE id = $2 AND doctor_id = $3
       RETURNING id, estado, motivo_cancelacion`,
      [motivo || 'Cancelada por el médico', citaId, doctorId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Cita cancelada exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en cancelarCita:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
}

/**
 * POST /api/citas/:id/confirmar
 * Confirmar cita (paciente)
 */
async function confirmarCita(req, res) {
  const client = await pool.connect();
  
  try {
    const doctorId = req.doctor.id;
    const citaId = req.params.id;

    const citaExistente = await client.query(
      `SELECT id, estado, fecha_hora, paciente_id 
       FROM citas 
       WHERE id = $1 AND doctor_id = $2`,
      [citaId, doctorId]
    );

    if (citaExistente.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cita no encontrada o no pertenece a tu cuenta'
      });
    }

    const cita = citaExistente.rows[0];

    if (cita.estado === 'CANCELADA') {
      return res.status(400).json({
        success: false,
        message: 'No se puede confirmar una cita cancelada'
      });
    }

    if (cita.estado === 'COMPLETADA') {
      return res.status(400).json({
        success: false,
        message: 'Esta cita ya fue completada'
      });
    }

    if (cita.estado === 'CONFIRMADA') {
      return res.status(400).json({
        success: false,
        message: 'Esta cita ya está confirmada'
      });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE citas 
       SET estado = 'CONFIRMADA', 
           confirmacion_paciente = TRUE,
           updated_at = NOW()
       WHERE id = $1 AND doctor_id = $2
       RETURNING id, estado, fecha_hora`,
      [citaId, doctorId]
    );

    await client.query('COMMIT');

    const fechaFormateada = new Date(cita.fecha_hora).toLocaleDateString('es-MX');
    const horaFormateada = new Date(cita.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    res.json({
      success: true,
      message: `Cita confirmada. Te esperamos el ${fechaFormateada} a las ${horaFormateada} hrs.`,
      data: result.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en confirmarCita:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
}

/**
 * POST /api/citas/:id/reprogramar
 * Reprogramar cita (crea nueva cita y cancela la anterior)
 */
async function reprogramarCita(req, res) {
  const client = await pool.connect();
  
  try {
    const doctorId = req.doctor.id;
    const citaId = req.params.id;
    const { nueva_fecha_hora, motivo } = req.body;

    if (!nueva_fecha_hora) {
      return res.status(400).json({
        success: false,
        message: 'nueva_fecha_hora es requerida'
      });
    }

    // Verificar cita original
    const citaOriginal = await client.query(
      `SELECT paciente_id, consultorio_id, tipo, notas 
       FROM citas 
       WHERE id = $1 AND doctor_id = $2 
         AND estado NOT IN ('CANCELADA', 'COMPLETADA')`,
      [citaId, doctorId]
    );

    if (citaOriginal.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cita no encontrada o no se puede reprogramar'
      });
    }

    const cita = citaOriginal.rows[0];

    await client.query('BEGIN');

    // Cancelar cita original
    await client.query(
      `UPDATE citas 
       SET estado = 'REPROGRAMADA', 
           motivo_cancelacion = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [motivo || `Reprogramada para ${new Date(nueva_fecha_hora).toLocaleString()}`, citaId]
    );

    // Crear nueva cita
    const nuevaCita = await client.query(
      `INSERT INTO citas (
        doctor_id, paciente_id, consultorio_id,
        fecha_hora, duracion_minutos, tipo, estado, notas
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PROGRAMADA', $7)
      RETURNING id, fecha_hora`,
      [
        doctorId, 
        cita.paciente_id, 
        cita.consultorio_id,
        nueva_fecha_hora, 
        30, 
        cita.tipo || 'CONSULTA',
        cita.notas
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Cita reprogramada correctamente',
      data: {
        cita_original_id: parseInt(citaId),
        cita_nueva_id: nuevaCita.rows[0].id,
        nueva_fecha_hora: nuevaCita.rows[0].fecha_hora
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en reprogramarCita:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
}

module.exports = {
  listarCitas,
  obtenerCita,
  crearCita,
  actualizarCita,
  cancelarCita,
  confirmarCita,
  reprogramarCita
};
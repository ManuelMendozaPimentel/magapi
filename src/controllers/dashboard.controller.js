const pool = require('../config/database');

/**
 * GET /api/dashboard/resumen
 * Métricas principales para el médico
 */
async function obtenerResumen(req, res) {
  try {
    const doctorId = req.doctor.id;

    // 1. Total de pacientes activos
    const pacientesResult = await pool.query(
      `SELECT COUNT(*)::INTEGER as total
       FROM doctores_pacientes
       WHERE doctor_id = $1 AND activo = TRUE`,
      [doctorId]
    );

    // 2. Consultas del mes actual
    const consultasMesResult = await pool.query(
      `SELECT COUNT(*)::INTEGER as total
       FROM consultas
       WHERE doctor_id = $1 
         AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`,
      [doctorId]
    );

    // 3. Consultas de la semana actual
    const consultasSemanaResult = await pool.query(
      `SELECT COUNT(*)::INTEGER as total
       FROM consultas
       WHERE doctor_id = $1 
         AND DATE_TRUNC('week', created_at) = DATE_TRUNC('week', CURRENT_DATE)`,
      [doctorId]
    );

    // 4. Citas próximas (próximos 7 días) - USANDO TABLA CITAS
    const citasProximasResult = await pool.query(
      `SELECT 
         c.id,
         p.id as paciente_id,
         p.nombre_completo as paciente_nombre,
         c.fecha_hora,
         c.duracion_minutos,
         c.tipo,
         c.estado,
         co.nombre_institucion as consultorio
       FROM citas c
       JOIN pacientes p ON p.id = c.paciente_id
       LEFT JOIN consultorios co ON co.id = c.consultorio_id
       WHERE c.doctor_id = $1 
         AND c.estado IN ('PROGRAMADA', 'CONFIRMADA')
         AND c.fecha_hora BETWEEN NOW() AND NOW() + INTERVAL '7 days'
       ORDER BY c.fecha_hora ASC
       LIMIT 10`,
      [doctorId]
    );

    // 5. Alertas pendientes (pacientes sin consulta en últimos 90 días)
    const alertasResult = await pool.query(
      `SELECT 
         p.id as paciente_id,
         p.nombre_completo as paciente_nombre,
         p.correo,
         p.telefono,
         MAX(c.created_at) as ultima_consulta,
         EXTRACT(DAY FROM (NOW() - COALESCE(MAX(c.created_at), p.created_at)))::INTEGER as dias_sin_consulta
       FROM doctores_pacientes dp
       JOIN pacientes p ON p.id = dp.paciente_id
       LEFT JOIN consultas c ON c.paciente_id = p.id AND c.doctor_id = dp.doctor_id
       WHERE dp.doctor_id = $1 
         AND dp.activo = TRUE
       GROUP BY p.id, p.nombre_completo, p.correo, p.telefono, p.created_at
       HAVING MAX(c.created_at) IS NULL 
         OR MAX(c.created_at) < NOW() - INTERVAL '90 days'
       LIMIT 10`,
      [doctorId]
    );

    // 6. Actividad de los últimos 7 días (para gráfico)
    const actividadResult = await pool.query(
      `SELECT 
         DATE_TRUNC('day', created_at) as fecha,
         COUNT(*)::INTEGER as total
       FROM consultas
       WHERE doctor_id = $1 
         AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE_TRUNC('day', created_at)
       ORDER BY fecha ASC`,
      [doctorId]
    );

    // Formatear actividad para los últimos 7 días
    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const actividad = [];
    const hoy = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() - i);
      fecha.setHours(0, 0, 0, 0);
      
      const fechaStr = fecha.toISOString().split('T')[0];
      const encontrado = actividadResult.rows.find(r => 
        r.fecha.toISOString().split('T')[0] === fechaStr
      );
      
      actividad.push({
        dia: diasSemana[fecha.getDay()],
        fecha: fechaStr,
        consultas: encontrado ? encontrado.total : 0
      });
    }

    res.json({
      success: true,
      data: {
        total_pacientes_activos: pacientesResult.rows[0].total,
        consultas_este_mes: consultasMesResult.rows[0].total,
        consultas_semana_actual: consultasSemanaResult.rows[0].total,
        citas_proximas: citasProximasResult.rows.map(c => ({
          id: c.id,
          paciente_id: c.paciente_id,
          paciente_nombre: c.paciente_nombre,
          fecha_hora: c.fecha_hora,
          duracion: c.duracion_minutos,
          tipo: c.tipo,
          estado: c.estado,
          consultorio: c.consultorio
        })),
        alertas_pendientes: alertasResult.rows.map(a => ({
          paciente_id: a.paciente_id,
          paciente_nombre: a.paciente_nombre,
          tipo: 'SIN_CONSULTA',
          mensaje: `Paciente sin consulta en los últimos ${a.dias_sin_consulta} días`,
          dias_sin_consulta: a.dias_sin_consulta
        })),
        actividad_reciente: actividad
      }
    });

  } catch (error) {
    console.error('Error en obtenerResumen:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

/**
 * GET /api/dashboard/alertas
 * Lista detallada de alertas activas
 */
async function listarAlertas(req, res) {
  try {
    const doctorId = req.doctor.id;
    const { tipo, limit = 50, offset = 0 } = req.query;

    let alertas = [];

    // Alertas por falta de consulta
    const sinConsulta = await pool.query(
      `SELECT 
         p.id as paciente_id,
         p.nombre_completo as paciente_nombre,
         p.correo,
         p.telefono,
         MAX(c.created_at) as ultima_consulta,
         EXTRACT(DAY FROM (NOW() - COALESCE(MAX(c.created_at), p.created_at)))::INTEGER as dias_sin_consulta
       FROM doctores_pacientes dp
       JOIN pacientes p ON p.id = dp.paciente_id
       LEFT JOIN consultas c ON c.paciente_id = p.id AND c.doctor_id = dp.doctor_id
       WHERE dp.doctor_id = $1 
         AND dp.activo = TRUE
       GROUP BY p.id, p.nombre_completo, p.correo, p.telefono, p.created_at
       HAVING MAX(c.created_at) IS NULL 
         OR MAX(c.created_at) < NOW() - INTERVAL '90 days'
       ORDER BY dias_sin_consulta DESC
       LIMIT $2 OFFSET $3`,
      [doctorId, parseInt(limit), parseInt(offset)]
    );

    sinConsulta.rows.forEach(row => {
      let severidad = 'BAJA';
      if (row.dias_sin_consulta > 180) severidad = 'ALTA';
      else if (row.dias_sin_consulta > 90) severidad = 'MEDIA';
      
      alertas.push({
        id: `sin_consulta_${row.paciente_id}`,
        paciente_id: row.paciente_id,
        paciente_nombre: row.paciente_nombre,
        correo: row.correo,
        telefono: row.telefono,
        tipo: 'SIN_CONSULTA',
        mensaje: `Paciente sin consulta en los últimos ${row.dias_sin_consulta} días`,
        severidad: severidad,
        creada: row.ultima_consulta || new Date(),
        dias_sin_consulta: row.dias_sin_consulta
      });
    });

    // Filtrar por tipo si se especifica
    if (tipo && tipo !== 'TODAS') {
      alertas = alertas.filter(a => a.tipo === tipo);
    }

    res.json({
      success: true,
      data: alertas,
      total: alertas.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Error en listarAlertas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

/**
 * GET /api/dashboard/citas-proximas
 * Próximas citas agendadas (usando tabla citas)
 */
async function listarCitasProximas(req, res) {
  try {
    const doctorId = req.doctor.id;
    const { dias = 7 } = req.query;

    const result = await pool.query(
      `SELECT 
         c.id,
         p.id as paciente_id,
         p.nombre_completo as paciente_nombre,
         p.correo as paciente_correo,
         p.telefono as paciente_telefono,
         c.fecha_hora,
         c.duracion_minutos,
         c.tipo,
         c.estado,
         c.notas,
         co.nombre_institucion as consultorio,
         c.created_at
       FROM citas c
       JOIN pacientes p ON p.id = c.paciente_id
       LEFT JOIN consultorios co ON co.id = c.consultorio_id
       WHERE c.doctor_id = $1 
         AND c.estado IN ('PROGRAMADA', 'CONFIRMADA')
         AND c.fecha_hora BETWEEN NOW() AND NOW() + INTERVAL '1 day' * $2
       ORDER BY c.fecha_hora ASC`,
      [doctorId, parseInt(dias)]
    );

    // Agrupar por fecha
    const agrupadas = {
      hoy: [],
      manana: [],
      esta_semana: []
    };

    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    
    const mananaInicio = new Date(hoyInicio);
    mananaInicio.setDate(mananaInicio.getDate() + 1);
    
    const semanaFin = new Date(hoyInicio);
    semanaFin.setDate(semanaFin.getDate() + 7);

    result.rows.forEach(cita => {
      const fechaCita = new Date(cita.fecha_hora);
      const horaFormateada = fechaCita.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      
      const citaFormateada = {
        ...cita,
        hora: horaFormateada,
        fecha: fechaCita.toISOString().split('T')[0]
      };
      
      if (fechaCita >= hoyInicio && fechaCita < mananaInicio) {
        agrupadas.hoy.push(citaFormateada);
      } else if (fechaCita >= mananaInicio && fechaCita < semanaFin) {
        agrupadas.manana.push(citaFormateada);
      } else {
        agrupadas.esta_semana.push(citaFormateada);
      }
    });

    res.json({
      success: true,
      data: agrupadas,
      total: result.rowCount
    });

  } catch (error) {
    console.error('Error en listarCitasProximas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

module.exports = {
  obtenerResumen,
  listarAlertas,
  listarCitasProximas
};
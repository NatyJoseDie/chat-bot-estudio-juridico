import { supabase } from '../config/supabase.js';

/**
 * Registra un nuevo turno en la base de datos.
 *
 * @param {{
 *   cliente_id: string,
 *   resumen_caso: string,
 *   fecha_turno?: string|null,       // ISO 8601 o NULL (coordinar luego manualmente)
 *   google_event_id?: string|null,
 *   estado?: 'pendiente' | 'confirmado' | 'cancelado'
 * }} turno
 * @returns {Promise<object>} El turno recién creado.
 */
export async function registrarTurno({
  cliente_id,
  resumen_caso,
  fecha_turno = null,
  google_event_id = null,
  estado = 'pendiente',
}) {
  const { data, error } = await supabase
    .from('turnos')
    .insert({ cliente_id, resumen_caso, fecha_turno, google_event_id, estado })
    .select()
    .single();

  if (error) throw new Error(`Error al registrar turno: ${error.message}`);
  return data;
}

/**
 * Obtiene todos los turnos de un cliente dado su ID.
 * @param {string} cliente_id
 * @returns {Promise<object[]>}
 */
export async function obtenerTurnosPorCliente(cliente_id) {
  const { data, error } = await supabase
    .from('turnos')
    .select('*')
    .eq('cliente_id', cliente_id)
    .order('creado_en', { ascending: false });

  if (error) throw new Error(`Error al obtener turnos: ${error.message}`);
  return data;
}

/**
 * Actualiza el estado de un turno.
 * @param {string} turnoId
 * @param {'pendiente'|'confirmado'|'cancelado'} nuevoEstado
 * @returns {Promise<object>} El turno actualizado.
 */
export async function actualizarEstadoTurno(turnoId, nuevoEstado) {
  const { data, error } = await supabase
    .from('turnos')
    .update({ estado: nuevoEstado })
    .eq('id', turnoId)
    .select()
    .single();

  if (error) throw new Error(`Error al actualizar turno: ${error.message}`);
  return data;
}

/**
 * Actualiza la fecha y/o el evento de Google Calendar de un turno.
 * @param {string} turnoId
 * @param {{ fecha_turno?: string, google_event_id?: string|null }} datos
 * @returns {Promise<object>}
 */
export async function actualizarFechaTurno(turnoId, datos) {
  const { data, error } = await supabase
    .from('turnos')
    .update(datos)
    .eq('id', turnoId)
    .select()
    .single();

  if (error) throw new Error(`Error al actualizar fecha de turno: ${error.message}`);
  return data;
}

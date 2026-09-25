import { supabase } from '../config/supabase.js';

/**
 * Registra un nuevo pago (seña del turno) en la base de datos.
 *
 * @param {{
 *   turno_id: string,
 *   mp_pago_id?: string|null,      // ID de Mercado Pago (se completa después al crear la preferencia)
 *   monto: number,
 *   estado?: 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado'
 * }} pago
 * @returns {Promise<object>} El pago recién creado.
 */
export async function registrarPago({
  turno_id,
  mp_pago_id = null,
  monto,
  estado = 'pendiente',
}) {
  const { data, error } = await supabase
    .from('pagos')
    .insert({ turno_id, mp_pago_id, monto, estado })
    .select()
    .single();

  if (error) throw new Error(`Error al registrar pago: ${error.message}`);
  return data;
}

/**
 * Obtiene un pago por su ID de Mercado Pago.
 * @param {string} mpPagoId
 * @returns {Promise<object|null>}
 */
export async function buscarPagoPorMercadoPagoId(mpPagoId) {
  const { data, error } = await supabase
    .from('pagos')
    .select('*, turnos(*)')
    .eq('mp_pago_id', mpPagoId)
    .maybeSingle();

  if (error) throw new Error(`Error al buscar pago por MP ID: ${error.message}`);
  return data;
}

/**
 * Actualiza el estado y/o el mp_pago_id de un pago.
 * @param {string} pagoId
 * @param {{ estado?: string, mp_pago_id?: string|null }} datos
 * @returns {Promise<object>}
 */
export async function actualizarPago(pagoId, datos) {
  const { data, error } = await supabase
    .from('pagos')
    .update(datos)
    .eq('id', pagoId)
    .select()
    .single();

  if (error) throw new Error(`Error al actualizar pago: ${error.message}`);
  return data;
}

/**
 * Obtiene todos los pagos de un turno.
 * @param {string} turnoId
 * @returns {Promise<object[]>}
 */
export async function obtenerPagosPorTurno(turnoId) {
  const { data, error } = await supabase
    .from('pagos')
    .select('*')
    .eq('turno_id', turnoId)
    .order('creado_en', { ascending: false });

  if (error) throw new Error(`Error al obtener pagos del turno: ${error.message}`);
  return data;
}

import { supabase } from '../config/supabase.js';

/**
 * Busca un cliente por su número de teléfono.
 * @param {string} telefono - Número de teléfono en formato E.164 (sin '+').
 * @returns {Promise<object|null>} El cliente encontrado o null.
 */
export async function buscarClientePorTelefono(telefono) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('telefono', telefono)
    .maybeSingle();

  if (error) throw new Error(`Error al buscar cliente: ${error.message}`);
  return data;
}

/**
 * Crea un nuevo cliente en la base de datos.
 * @param {{ telefono: string, nombre_completo: string, email?: string|null }} cliente
 * @returns {Promise<object>} El cliente recién creado.
 */
export async function crearCliente({ telefono, nombre_completo, email = null }) {
  const { data, error } = await supabase
    .from('clientes')
    .insert({ telefono, nombre_completo, email })
    .select()
    .single();

  if (error) throw new Error(`Error al crear cliente: ${error.message}`);
  return data;
}

/**
 * Busca un cliente por teléfono y lo crea si no existe (upsert lógico).
 * @param {{ telefono: string, nombre_completo: string, email?: string|null }} datos
 * @returns {Promise<{ cliente: object, esNuevo: boolean }>}
 */
export async function buscarOCrearCliente(datos) {
  const clienteExistente = await buscarClientePorTelefono(datos.telefono);

  if (clienteExistente) {
    return { cliente: clienteExistente, esNuevo: false };
  }

  const nuevoCliente = await crearCliente(datos);
  return { cliente: nuevoCliente, esNuevo: true };
}

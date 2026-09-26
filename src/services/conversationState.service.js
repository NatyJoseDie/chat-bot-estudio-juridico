/**
 * Servicio de manejo de estado de conversación por usuario (en memoria).
 *
 * Estados posibles:
 *   'MENU'             -> El usuario está en el menú principal (estado inicial).
 *   'ESPERANDO_NOMBRE' -> El usuario eligió la opción de turno, esperamos su nombre completo.
 *   'ESPERANDO_MOTIVO' -> Ya tenemos el nombre, ahora esperamos el motivo de la consulta.
 *
 * NOTA: Por simplicidad usamos un Map en memoria. Si el servidor se reinicia,
 *       se pierden los estados pendientes. Para un entorno de producción real
 *       se recomienda reemplazar por Redis o tabla en Supabase.
 */

const ESTADO_INICIAL = 'MENU';
const TIMEOUT_INACTIVIDAD_MS = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Estructura por usuario:
 * {
 *   state: 'MENU' | 'ESPERANDO_NOMBRE' | 'ESPERANDO_MOTIVO',
 *   tempData: { name?: string },
 *   lastUpdated: number // Timestamp de la última interacción
 * }
 */
const conversaciones = new Map();

/**
 * Obtiene (o inicializa) el estado de una conversación por teléfono.
 * Si la conversación superó el tiempo de inactividad, la reinicia.
 * @param {string} phoneNumber - Número de teléfono del usuario.
 * @returns {{ state: string, tempData: object, lastUpdated: number }}
 */
export function getOrCreateConversation(phoneNumber) {
  const now = Date.now();

  if (!conversaciones.has(phoneNumber)) {
    conversaciones.set(phoneNumber, {
      state: ESTADO_INICIAL,
      tempData: {},
      lastUpdated: now,
    });
  } else {
    // Si ya existe, verificamos si superó el tiempo de inactividad
    const conv = conversaciones.get(phoneNumber);
    if (now - conv.lastUpdated > TIMEOUT_INACTIVIDAD_MS) {
      console.log(`⏳ [TIMEOUT] Reseteando sesión inactiva de: ${phoneNumber}`);
      conversaciones.set(phoneNumber, {
        state: ESTADO_INICIAL,
        tempData: {},
        lastUpdated: now,
      });
    }
  }
  return conversaciones.get(phoneNumber);
}

/**
 * Actualiza el estado de una conversación.
 * @param {string} phoneNumber
 * @param {string} newState
 * @param {object} [tempData={}] - Datos temporales extra a guardar.
 */
export function setConversationState(phoneNumber, newState, tempData = {}) {
  const actual = getOrCreateConversation(phoneNumber);
  conversaciones.set(phoneNumber, {
    state: newState,
    tempData: { ...actual.tempData, ...tempData },
    lastUpdated: Date.now(),
  });
}

/**
 * Resetea una conversación al estado inicial (menú principal).
 * @param {string} phoneNumber
 */
export function resetConversation(phoneNumber) {
  conversaciones.set(phoneNumber, {
    state: ESTADO_INICIAL,
    tempData: {},
    lastUpdated: Date.now(),
  });
}

/**
 * Limpia los datos temporales sin cambiar el estado actual.
 * @param {string} phoneNumber
 */
export function clearTempData(phoneNumber) {
  const actual = getOrCreateConversation(phoneNumber);
  actual.tempData = {};
}

/**
 * Servicio para interactuar con la API de WhatsApp Cloud (Meta).
 */

/**
 * Envía un mensaje de texto a un número de WhatsApp.
 * 
 * @param {string} to - Número de teléfono del destinatario (formato E.164 sin '+').
 * @param {string} text - El contenido del mensaje de texto a enviar.
 * @returns {Promise<object>} La respuesta de la API de Meta.
 */
export async function sendWhatsAppMessage(to, text) {
  try {
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const token = process.env.WHATSAPP_TOKEN;

    if (!phoneId || !token) {
      throw new Error('Faltan las credenciales de WhatsApp en el archivo .env (WHATSAPP_PHONE_ID o WHATSAPP_TOKEN)');
    }

    // --- INICIO PARCHE TEMPORAL PARA ARGENTINA ---
    // Si el número empieza con 54911, intentamos responderle al 5411 (sin el 9)
    // porque Meta a veces registra los números de prueba de Argentina sin el 9.
    let finalTo = to;
    if (to.startsWith('549')) {
      finalTo = to.replace('549', '54');
    }
    // --- FIN PARCHE TEMPORAL ---

    const url = `https://graph.facebook.com/v26.0/${phoneId}/messages`;
    
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      // Meta entrega el remitente sin "+" en message.from. Se reenvia sin modificarlo.
      to: finalTo,
      type: 'text',
      text: { 
        body: text 
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error al enviar mensaje a Meta:', {
        status: response.status,
        body: data,
      });
      throw new Error(`Error en la API de Meta: ${data.error?.message || 'Error desconocido'}`);
    }

    console.log(`✅ Mensaje enviado correctamente a ${to}`);
    return data;
  } catch (error) {
    console.error(`❌ Fallo al enviar mensaje a ${to}:`, error.message);
    throw error;
  }
}

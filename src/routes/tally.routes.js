import { Router } from 'express';
import { sendWhatsAppMessage } from '../services/whatsapp.service.js';
import { setConversationState } from '../services/conversationState.service.js';

const router = Router();
const processedEvents = new Set();

// Normaliza el teléfono argentino al formato de WhatsApp Cloud API (54911XXXXXXXX)
function normalizarTelefonoWhatsApp(rawPhone) {
    if (!rawPhone) return null;
    let digits = String(rawPhone).replace(/\D/g, '');
    if (!digits) return null;

    // Si empieza con 54 y no tiene el 9 después (ej: 541139587201), lo agrega
    if (digits.startsWith('54') && !digits.startsWith('549') && digits.length === 12) {
        digits = '549' + digits.slice(2);
    }
    return digits;
}

// POST /webhook/tally
router.post('/', async (req, res) => {
    res.status(200).json({ received: true });

    try {
        const payload = req.body;
        const eventId = payload?.eventId;

        // Evita procesar dos veces el mismo envío si Tally reintenta
        if (eventId) {
            if (processedEvents.has(eventId)) return;
            processedEvents.add(eventId);
            setTimeout(() => processedEvents.delete(eventId), 10 * 60 * 1000);
        }

        const formName = payload?.data?.formName || 'Consulta Jurídica';
        const fields = payload?.data?.fields || [];

        let resumenCampos = '';
        let clientPhoneRaw = null;

        for (const field of fields) {
            const pregunta = field.label || 'Campo';
            let valor = field.value;

            if (Array.isArray(valor) && field.options) {
                valor = valor
                    .map(id => field.options.find(opt => opt.id === id)?.text || id)
                    .join(', ');
            } else if (typeof valor === 'string' && field.options) {
                valor = field.options.find(opt => opt.id === valor)?.text || valor;
            }

            if (valor !== null && valor !== undefined && valor !== '') {
                resumenCampos += `• *${pregunta}:* ${valor}\n`;

                // Detecta el campo de WhatsApp / Teléfono del cliente
                if (
                    field.type === 'INPUT_PHONE_NUMBER' ||
                    pregunta.toLowerCase().includes('whatsapp') ||
                    pregunta.toLowerCase().includes('teléfono') ||
                    pregunta.toLowerCase().includes('telefono')
                ) {
                    clientPhoneRaw = valor;
                }
            }
        }

        // 1. Envía el resumen completo a la abogada (STUDIO_PHONE)
        const destinoWhatsApp = process.env.STUDIO_PHONE;
        if (destinoWhatsApp) {
            const mensajeEstudio =
                `📋 *NUEVA FICHA COMPLETADA*\n` +
                `📂 *Formulario:* ${formName}\n\n` +
                `${resumenCampos || '_Sin respuestas detalladas_'}\n` +
                `📩 _También tenés el respaldo en el correo del estudio._`;

            await sendWhatsAppMessage(destinoWhatsApp, mensajeEstudio);
            console.log(`✅ Resumen de Tally (${formName}) enviado al estudio.`);
        } else {
            console.warn('⚠️ Falta configurar la variable STUDIO_PHONE en .env / Render');
        }

        // 2. Envía confirmación al cliente y abre la pregunta de cierre
        const clientPhone = normalizarTelefonoWhatsApp(clientPhoneRaw);
        if (clientPhone) {
            const mensajeCliente =
                `✅ *¡Recibimos tu ficha de ${formName}!*\n\n` +
                `Ya le enviamos toda la información a la abogada del estudio para que evalúe tu caso.\n\n` +
                `¿Necesitás realizar alguna otra consulta?\n` +
                `• Respondé *SÍ* (o escribí *MENU*) para volver al menú principal.\n` +
                `• Respondé *NO* si ya finalizaste.`;

            await sendWhatsAppMessage(clientPhone, mensajeCliente);
            setConversationState(clientPhone, 'POST_TALLY');
            console.log(`✅ Confirmación enviada al cliente: ${clientPhone}`);
        }
    } catch (error) {
        console.error('❌ Error al procesar webhook de Tally:', error);
    }
});

export default router;
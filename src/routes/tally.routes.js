import { Router } from 'express';
import { sendWhatsAppMessage } from '../services/whatsapp.service.js';

const router = Router();
const processedEvents = new Set();

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
            }
        }

        const destinoWhatsApp = process.env.STUDIO_PHONE;
        if (!destinoWhatsApp) {
            console.warn('⚠️ Falta configurar la variable STUDIO_PHONE en .env / Render');
            return;
        }

        const mensaje =
            `📋 *NUEVA FICHA COMPLETADA*\n` +
            `📂 *Formulario:* ${formName}\n\n` +
            `${resumenCampos || '_Sin respuestas detalladas_'}\n` +
            `📩 _También tenés el respaldo en el correo del estudio._`;

        await sendWhatsAppMessage(destinoWhatsApp, mensaje);
        console.log(`✅ Resumen de Tally (${formName}) enviado por WhatsApp.`);
    } catch (error) {
        console.error('❌ Error al procesar webhook de Tally:', error);
    }
});

export default router;
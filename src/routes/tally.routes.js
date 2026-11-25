import { Router } from 'express';
import { sendWhatsAppMessage } from '../services/whatsapp.service.js';

const router = Router();

// POST /webhook/tally
router.post('/', async (req, res) => {
    // Respondemos 200 inmediatamente a Tally para que no reintente
    res.status(200).json({ received: true });

    try {
        const payload = req.body;
        const formName = payload?.data?.formName || 'Consulta Jurídica';
        const fields = payload?.data?.fields || [];

        let resumenCampos = '';

        for (const field of fields) {
            const pregunta = field.label || 'Campo';
            let valor = field.value;

            // Traduce los IDs de opciones múltiples o desplegables al texto real
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
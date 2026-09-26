import { Router } from 'express';

const router = Router();

import { sendWhatsAppMessage } from '../services/whatsapp.service.js';
import { processUserMessage } from '../controllers/bot.controller.js';

// GET /webhook (Verificación de Meta)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const MY_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode && token) {
    if (mode === 'subscribe' && token === MY_VERIFY_TOKEN) {
      console.log('✅ WEBHOOK VERIFICADO CORRECTAMENTE');
      return res.status(200).send(challenge);
    } else {
      console.log('❌ TOKEN DE VERIFICACIÓN INCORRECTO');
      return res.sendStatus(403);
    }
  }

  return res.sendStatus(400);
});

// POST /webhook (Recepción de mensajes)
router.post('/', async (req, res) => {
  // 1. Responder 200 inmediatamente a Meta (evita reintentos innecesarios)
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const entries = body.entry ?? [];

    for (const entry of entries) {
      const changes = entry.changes ?? [];

      for (const change of changes) {
        const value = change.value ?? {};
        const messages = value.messages ?? [];

        for (const message of messages) {
          const senderPhone = message.from;

          // Solo procesar si es un mensaje de texto
          if (message.type === 'text') {
            const messageText = message.text?.body ?? '';

            console.log(`📩 Mensaje entrante de ${senderPhone}: "${messageText}"`);

            try {
              // 2. Procesar el mensaje con el controlador del bot
              //    Ahora recibe (teléfono, texto) para manejar estado por usuario
              const botReply = await processUserMessage(senderPhone, messageText);

              // 3. Enviar la respuesta vía WhatsApp
              await sendWhatsAppMessage(senderPhone, botReply);
            } catch (error) {
              console.error(`⚠️ Error al procesar el mensaje de ${senderPhone}:`, error);
            }
          } else {
            // Manejar mensajes que no sean de texto (audios, imágenes, documentos, etc.)
            console.log(`📩 Mensaje multimedia (${message.type}) ignorado de ${senderPhone}`);
            
            try {
              const botReply = `🤖 *Estudio Escobar & Asociados*\n\nPor el momento, mi asistente virtual solo puede comprender *mensajes de texto*.\n\nPor favor, escribí tu consulta usando texto para que pueda ayudarte.`;
              await sendWhatsAppMessage(senderPhone, botReply);
            } catch (error) {
              console.error(`⚠️ Error al enviar respuesta de multimedia a ${senderPhone}:`, error);
            }
          }
        }
      }
    }
  }
});

export default router;

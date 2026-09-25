/**
 * Controlador de la lógica del bot de WhatsApp.
 * Maneja estado de conversación por usuario y persistencia en Supabase.
 *
 * Flujo actual:
 *   MENU → ESPERANDO_NOMBRE → ESPERANDO_MOTIVO → ESPERANDO_FECHA_HORA
 *       → (GUARDAR CLIENTE + TURNO) → (CREAR EVENTO GCAL) → (MAIL) → OK
 */

import {
  getOrCreateConversation,
  setConversationState,
  resetConversation,
} from '../services/conversationState.service.js';

import { buscarOCrearCliente } from '../services/clienteService.js';
import { registrarTurno, actualizarFechaTurno } from '../services/turnoService.js';
import { sendNewCaseEmail } from '../services/email.service.js';
import { parseFechaYHora, createCalendarEvent } from '../services/calendar.service.js';

/**
 * Procesa el mensaje entrante del usuario y determina la respuesta correspondiente.
 *
 * @param {string} phoneNumber  - Número del remitente (formato E.164 sin '+').
 * @param {string} incomingText - El texto del mensaje recibido.
 * @returns {Promise<string>}   El texto que se debe enviar como respuesta al usuario.
 */
export async function processUserMessage(phoneNumber, incomingText) {
  const normalizedText = incomingText.trim().toLowerCase();

  // ============================================================
  // COMANDO GLOBAL: Volver al menú principal en cualquier momento
  // ============================================================
  if (normalizedText === 'menu' || normalizedText === '0') {
    resetConversation(phoneNumber);
    return mensajeMenuPrincipal();
  }

  // Obtenemos (o inicializamos) el estado actual de la conversación del usuario
  const conversation = getOrCreateConversation(phoneNumber);
  const { state, tempData } = conversation;

  // ============================================================
  // MAQUINA DE ESTADOS
  // ============================================================
  switch (state) {
    // --------------------------------------------------------
    // ESTADO: ESPERANDO_NOMBRE
    // --------------------------------------------------------
    case 'ESPERANDO_NOMBRE': {
      const nombre = incomingText.trim();

      if (nombre.length < 2) {
        return `⚠️ Por favor, escribí tu nombre completo (al menos 2 caracteres).\n\nSi querés volver al menú principal, escribí *MENU*.`;
      }

      setConversationState(phoneNumber, 'ESPERANDO_MOTIVO', { name: nombre });

      return `✅ *Perfecto, ${capitalizar(nombre)}.*\n\n` +
             `Ahora contame brevemente cuál es el *motivo de tu consulta* para agendar el turno.\n\n` +
             `Si querés volver al menú principal, escribí *MENU*.`;
    }

    // --------------------------------------------------------
    // ESTADO: ESPERANDO_MOTIVO
    // --------------------------------------------------------
    case 'ESPERANDO_MOTIVO': {
      const resumen_caso = incomingText.trim();

      if (resumen_caso.length < 5) {
        return `⚠️ Por favor, describe con un poco más de detalle el motivo de tu consulta (al menos 5 caracteres).\n\nSi querés volver al menú principal, escribí *MENU*.`;
      }

      setConversationState(phoneNumber, 'ESPERANDO_FECHA_HORA', {
        ...tempData,
        resumen_caso,
      });

      const nombre = tempData.name ? capitalizar(tempData.name) : '';
      return `📝 *${nombre ? nombre + ', ' : ''}muchas gracias por el detalle.*\n\n` +
             `Ahora por favor indicame *qué día y en qué franja horaria* preferís la reunión (presencial o virtual).\n\n` +
             `Algunos ejemplos de cómo escribirme:\n` +
             `• *"Lunes 30/09 a las 10:30 hs"*\n` +
             `• *"Mañana a las 14"*\n` +
             `• *"30 de septiembre tarde"*\n` +
             `• *"Viernes 11am"*\n\n` +
             `Si querés volver al menú principal, escribí *MENU*.`;
    }

    // --------------------------------------------------------
    // ESTADO: ESPERANDO_FECHA_HORA
    // Tiene el nombre y el motivo. Ahora parseamos fecha/hora y guardamos TODO.
    // --------------------------------------------------------
    case 'ESPERANDO_FECHA_HORA': {
      const textoFecha = incomingText.trim();
      const clienteNombreCompleto = tempData.name;
      const resumen_caso = tempData.resumen_caso;

      try {
        // 1) Intentamos parsear el texto libre del usuario
        const fechaParseada = parseFechaYHora(textoFecha);
        const fechaTurnoISO = fechaParseada.start.toISOString();

        // 2) Creamos / buscamos cliente
        const { cliente, esNuevo } = await buscarOCrearCliente({
          telefono: phoneNumber,
          nombre_completo: clienteNombreCompleto,
          email: null,
        });

        // 3) Damos de ALTA el turno SIN google_event_id (aún no lo tenemos)
        //    y con fecha_turno ya seteada.
        let turno = await registrarTurno({
          cliente_id: cliente.id,
          resumen_caso,
          fecha_turno: fechaTurnoISO,
          google_event_id: null,
          estado: 'pendiente',
        });

        // 4) Intentamos crear el evento en Google Calendar.
        //    Si falla (por credenciales, permisos, etc.) NO ROMPEMOS el flujo:
        //    simplemente lo logueamos y seguimos (el turno ya está guardado).
        let gcalEvent = null;
        try {
          gcalEvent = await createCalendarEvent(
            turno,
            cliente,
            { start: fechaParseada.start, end: fechaParseada.end },
            fechaParseada.textoHumano
          );

          // 4.b) Actualizamos el turno con el google_event_id y re-asignamos fecha
          turno = await actualizarFechaTurno(turno.id, {
            google_event_id: gcalEvent.id,
            fecha_turno: fechaTurnoISO,
          });
        } catch (gcalError) {
          console.warn(
            `⚠️ El turno se guardó OK, pero falló la creación del evento en Google Calendar:`,
            gcalError.message || gcalError
          );
        }

        // 5) Notificamos al estudio por mail
        try {
          await sendNewCaseEmail(cliente, {
            ...turno,
            _gcalLink: gcalEvent?.htmlLink || null,
            _gcalMeetLink: gcalEvent?.hangoutLink || null,
            _fechaHumano: fechaParseada.textoHumano,
          });
        } catch (emailError) {
          console.warn(
            `⚠️ El turno se guardó OK, pero falló el envío de mail al estudio:`,
            emailError.message || emailError
          );
        }

        // 6) Volvemos al usuario al menú y le confirmamos TODO
        resetConversation(phoneNumber);

        return `🎉 *${capitalizar(clienteNombreCompleto)}, tu solicitud se registró correctamente.*\n\n` +
               `📋 *Resumen del turno:*\n` +
               `• Cliente: ${clienteNombreCompleto}\n` +
               `• Motivo: ${resumen_caso}\n` +
               `• 📅 Fecha propuesta: ${fechaParseada.textoHumano}\n\n` +
               `${gcalEvent?.htmlLink ? `• 📅 [Evento agregado al calendario de Estudio Escobar & Asociados](${gcalEvent.htmlLink})\n` : ''}` +
               `${gcalEvent?.hangoutLink ? `• 💻 [Enlace de Meet para reunión virtual](${gcalEvent.hangoutLink})\n\n` : (gcalEvent ? '\n' : '')}` +
               `A la brevedad un asesor de *Estudio Jurídico Escobar & Asociados* se pondrá en contacto para confirmar el horario o proponer otra alternativa si la franja no estuviera disponible.\n\n` +
               `${esNuevo ? '🆕 Además, te dimos de alta en nuestra base de clientes.\n\n' : ''}` +
               `Si tenés otra consulta, volvé al menú escribiendo *MENU*.`;

      } catch (error) {
        console.error(`❌ Error al procesar turno para ${phoneNumber}:`, error);
        resetConversation(phoneNumber);
        return `⚠️ *Ocurrió un error interno al registrar tu turno.*\n\n` +
               `Por favor, volvé a intentarlo en unos minutos o comunicate directamente al número de contacto de urgencia: *+54 9 11 0000-0000*.\n\n` +
               `Si querés volver al menú principal, escribí *MENU*.`;
      }
    }

    // --------------------------------------------------------
    // ESTADO: MENU (default)
    // --------------------------------------------------------
    case 'MENU':
    default: {
      return manejarOpcionMenu(phoneNumber, normalizedText);
    }
  }
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * Maneja las opciones del menú principal (estado MENU).
 * @param {string} phoneNumber
 * @param {string} normalizedText
 * @returns {string} Respuesta al usuario.
 */
function manejarOpcionMenu(phoneNumber, normalizedText) {
  switch (normalizedText) {
    case '1':
    case 'consulta':
    case 'consultas':
      return `⚖️ *Áreas de Práctica - Estudio Jurídico Escobar & Asociados*\n\n` +
             `Nos especializamos en:\n` +
             `• Derecho Laboral\n` +
             `• Derecho Civil\n` +
             `• Derecho de Familia\n` +
             `• Derecho Comercial\n\n` +
             `Para solicitar un turno y analizar tu caso en detalle, por favor escribí la palabra *TURNO* o elegí la opción 2.`;

    case '2':
    case 'turno':
    case 'turnos': {
      setConversationState(phoneNumber, 'ESPERANDO_NOMBRE');
      return `📅 *Solicitud de Turno*\n\n` +
             `Para agendar una reunión presencial o virtual, por favor respondeme en este mismo mensaje tu *nombre completo*.\n\n` +
             `Si querés cancelar y volver al menú principal, escribí *MENU*.`;
    }

    case '3':
    case 'urgencia':
    case 'urgencias':
      return `🚨 *Contacto de Urgencia*\n\n` +
             `Si te encontrás ante una situación legal urgente, por favor comunicate inmediatamente por llamada telefónica al número directo: *+54 9 11 0000-0000*.`;

    default:
      return mensajeMenuPrincipal();
  }
}

/**
 * Devuelve el mensaje de bienvenida con el menú principal.
 * @returns {string}
 */
function mensajeMenuPrincipal() {
  return `👋 *¡Hola! Bienvenido a **Estudio Jurídico Escobar & Asociados**.*\n\n` +
         `Por favor, respondé con el *número* o la *palabra* de la opción deseada:\n\n` +
         `*1. Consulta* - Información sobre nuestras áreas de práctica.\n` +
         `*2. Turno* - Solicitar una reunión con un abogado.\n` +
         `*3. Urgencia* - Contacto directo para casos urgentes.`;
}

/**
 * Capitaliza la primera letra de un texto.
 * @param {string} texto
 * @returns {string}
 */
function capitalizar(texto) {
  if (!texto) return '';
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

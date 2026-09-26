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
  if (['menu', '0', 'hola', 'buenas', 'buen dia', 'buen día', 'buenas tardes', 'buenas noches'].includes(normalizedText)) {
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
    // ESTADO: ESPERANDO_TIPO_CONSULTA
    // --------------------------------------------------------
    case 'ESPERANDO_TIPO_CONSULTA': {
      const opcion = normalizedText;
      if (['1', '4', 'alimentos', 'laboral'].includes(opcion) || opcion.includes('alimentos') || opcion.includes('laboral') || opcion.includes('despidos')) {
        setConversationState(phoneNumber, 'MENU');
        return `✅ *Consulta Gratuita seleccionada*\n` +
               `Para avanzar con la evaluación de tu caso, ingresá la palabra *TURNO* o responde *2* para completar la ficha y agendar tu cita.`;
      } else if (['2', '3', '5', 'divorcio', 'separacion', 'regimen', 'comunicacion', 'otros'].some(k => opcion.includes(k) || opcion === k)) {
        setConversationState(phoneNumber, 'MENU');
        return `💳 *Consulta Paga seleccionada ($20.000 ARS)*\n` +
               `El costo cubre la evaluación técnica del caso. Para completar la ficha y recibir el enlace de pago de Mercado Pago, ingresá la palabra *TURNO* o responde *2*.`;
      } else {
        return `⚠️ Opción no válida.\n\n` +
               `Escribí el *número* de la opción (del 1 al 5) o la palabra *MENU* para volver atrás.`;
      }
    }

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
    case 'iniciar consulta':
      setConversationState(phoneNumber, 'ESPERANDO_TIPO_CONSULTA');
      return `📑 *Áreas de Práctica & Consultas*\n\n` +
             `Seleccioná la materia correspondiente a tu caso:\n\n` +
             `📌 *1. Alimentos* (Consulta Gratuita)\n` +
             `📌 *2. Divorcio / Separación* (Consulta Paga - $20.000 ARS)\n` +
             `📌 *3. Régimen de Comunicación* (Consulta Paga - $20.000 ARS)\n` +
             `📌 *4. Derecho Laboral / Despidos* (Consulta Gratuita)\n` +
             `📌 *5. Otros fueros* (Consulta Paga - $20.000 ARS)\n\n` +
             `💡 _Nota: El valor abonado en consultas pagas es descontable de los honorarios finales en caso de contratación._\n\n` +
             `Escribí el *número* de la opción o la palabra *MENU* para volver atrás.`;

    case '2':
    case 'turno':
    case 'turnos':
    case 'agendar':
      setConversationState(phoneNumber, 'ESPERANDO_NOMBRE');
      return `📅 *Solicitud y Gestión de Turnos*\n\n` +
             `Para agendar una reunión presencial o virtual con la abogada, por favor envianos tu *nombre y apellido completo*.\n\n` +
             `_(Si deseás cancelar y volver al menú principal, escribí *MENU*)_`;

    case '3':
    case 'abogado':
    case 'hablar con un abogado':
      return `🚨 *Solicitud de Atención Prioritaria*\n\n` +
             `Hemos enviado una alerta directa al equipo legal notificando tu solicitud. Te contactaremos a la brevedad dentro de nuestro horario de atención (Lunes a Viernes de 09:00 a 18:00 hs).`;

    case '4':
    case 'horarios':
    case 'ubicacion':
    case 'horarios y ubicacion':
      return `📍 *Horarios & Ubicación - Estudio Jurídico Escobar & Asociados*\n\n` +
             `🏢 *Atención Presencial:* Lunes a Viernes de 09:00 a 18:00 hs.\n` +
             `📞 *Atención Telefónica:* Lunes a Viernes de 09:00 a 18:00 hs.\n` +
             `📍 *Oficina Central:* (Reemplazar con la dirección real)\n` +
             `🗺️ *Google Maps:* (Enlace directo a la ubicación)\n\n` +
             `Escribí *MENU* para volver al inicio.`;

    default:
      return mensajeMenuPrincipal();
  }
}

/**
 * Devuelve el mensaje de bienvenida con el menú principal.
 * @returns {string}
 */
function mensajeMenuPrincipal() {
  return `⚖️ *Estudio Jurídico Escobar & Asociados*\n` +
         `_Asistencia Legal Especializada_\n\n` +
         `¡Hola! Te damos la bienvenida. Por favor, seleccioná una opción respondiendo con el *número* o la *palabra clave*:\n\n` +
         `1️⃣ *Iniciar Consulta* (Familia y Laboral)\n` +
         `2️⃣ *Agendar / Ver Turnos* (Gestión de citas)\n` +
         `3️⃣ *Hablar con un Abogado* (Atención prioritaria)\n` +
         `4️⃣ *Horarios y Ubicación* (Dirección y mapa)`;
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

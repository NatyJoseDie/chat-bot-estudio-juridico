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
import { sendNewCaseEmail, sendCancellationEmail } from '../services/email.service.js';
import { parseFechaYHora, createCalendarEvent } from '../services/calendar.service.js';
import { sendWhatsAppMessage } from '../services/whatsapp.service.js';

/**
 * Procesa el mensaje entrante del usuario y determina la respuesta correspondiente.
 *
 * @param {string} phoneNumber  - Número del remitente (formato E.164 sin '+').
 * @param {string} incomingText - El texto del mensaje recibido.
 * @returns {Promise<string>}   El texto que se debe enviar como respuesta al usuario.
 */
export async function processUserMessage(phoneNumber, incomingText) {
  const normalizedText = incomingText.trim().toLowerCase();

  // Obtenemos (o inicializamos) el estado actual de la conversación del usuario
  const conversation = getOrCreateConversation(phoneNumber);
  const { state, tempData } = conversation;

  // ============================================================
  // COMANDO GLOBAL: Volver al menú principal en cualquier momento
  // ============================================================
  if (['menu', '0', 'hola', 'buenas', 'buen dia', 'buen día', 'buenas tardes', 'buenas noches'].includes(normalizedText)) {
    resetConversation(phoneNumber);
    const avisoHorario = esFueraDeHorario() && !tempData.warnedOutOfHours;
    if (avisoHorario) {
      setConversationState(phoneNumber, 'MENU', { warnedOutOfHours: true });
    }
    return mensajeMenuPrincipal(avisoHorario);
  }

  // ============================================================
  // Si el usuario es nuevo (o no tiene estado) y no escribió "hola" ni "menu"
  // ============================================================
  if (state === 'MENU' && !['1', '2', '3', '4', 'consulta', 'consultas', 'iniciar consulta', 'turno', 'turnos', 'agendar', 'abogado', 'hablar con un abogado', 'horarios', 'ubicacion', 'horarios y ubicacion'].includes(normalizedText)) {
      const avisoHorario = esFueraDeHorario() && !tempData.warnedOutOfHours;
      if (avisoHorario) {
        setConversationState(phoneNumber, 'MENU', { warnedOutOfHours: true });
      }
      return mensajeMenuPrincipal(avisoHorario);
  }

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
    // ESTADO: SUBMENU_TURNOS
    // --------------------------------------------------------
    case 'SUBMENU_TURNOS': {
      const opcion = normalizedText;
      if (opcion === 'a' || opcion.includes('agendar') || opcion.includes('nuevo')) {
        setConversationState(phoneNumber, 'ESPERANDO_NOMBRE');
        return `📅 *Agendar Nuevo Turno*\n\n` +
               `Para agendar una reunión presencial o virtual con la abogada, por favor envianos tu *nombre y apellido completo*.\n\n` +
               `_(Si deseás volver al menú principal, escribí *MENU*)_`;
      } else if (opcion === 'b' || opcion.includes('cancelar')) {
        setConversationState(phoneNumber, 'ESPERANDO_NOMBRE_CANCELACION');
        return `❌ *Cancelar Turno*\n\n` +
               `Para procesar la cancelación, por favor indicanos tu *nombre y apellido completo* con el que registraste el turno.\n\n` +
               `_(Si deseás volver al menú principal, escribí *MENU*)_`;
      } else {
        return `⚠️ Opción no válida.\n\n` +
               `Escribí la letra *A* para agendar o *B* para cancelar (o *MENU* para volver al inicio).`;
      }
    }

    // --------------------------------------------------------
    // ESTADO: ESPERANDO_NOMBRE_CANCELACION
    // --------------------------------------------------------
    case 'ESPERANDO_NOMBRE_CANCELACION': {
      const nombre = incomingText.trim();
      if (nombre.length < 2) {
        return `⚠️ Por favor, escribí tu nombre completo (al menos 2 caracteres).\n\nSi querés volver al menú principal, escribí *MENU*.`;
      }

      // Notificar al estudio internamente (opcionalmente podríamos mandar un mail)
      try {
        await sendCancellationEmail(phoneNumber, capitalizar(nombre));
      } catch (error) {
        console.error(`⚠️ Error al enviar mail de cancelación para ${phoneNumber}:`, error);
      }
      
      // Por ahora confirmamos la recepción al cliente y reseteamos el flujo
      resetConversation(phoneNumber);
      return `✅ *Solicitud Recibida*\n\n` +
             `Hemos notificado al equipo sobre la cancelación del turno a nombre de *${capitalizar(nombre)}*.\n` +
             `Un asesor lo procesará a la brevedad para liberar la agenda.\n\n` +
             `¡Gracias por avisarnos!\n\n` +
             `Si necesitás algo más, escribí *MENU*.`;
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
        return `⚠️ Por favor, describí con un poco más de detalle el motivo de tu consulta (al menos 5 caracteres).\n\nSi querés volver al menú principal, escribí *MENU*.`;
      }

      setConversationState(phoneNumber, 'ESPERANDO_FECHA_HORA', {
        ...tempData,
        resumen_caso,
      });

      const nombre = tempData.name ? capitalizar(tempData.name) : '';
      return `📝 *${nombre ? nombre + ', ' : ''}muchas gracias por el detalle.*\n\n` +
             `Para finalizar, por favor indicame *qué día y en qué franja horaria* preferís la reunión (presencial o virtual).\n\n` +
             `Algunos ejemplos de cómo escribirme:\n` +
             `• *"Lunes 30/09 a las 10:30 hs"*\n` +
             `• *"Mañana a las 14"*\n` +
             `• *"30 de septiembre a la tarde"*\n` +
             `• *"Viernes 11 am"*\n\n` +
             `Si querés cancelar y volver al menú principal, escribí *MENU*.`;
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
      return await manejarOpcionMenu(phoneNumber, normalizedText);
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
 * @returns {Promise<string>} Respuesta al usuario.
 */
async function manejarOpcionMenu(phoneNumber, normalizedText) {
  switch (normalizedText) {
    case '1':
    case 'consulta':
    case 'consultas':
    case 'iniciar consulta':
      setConversationState(phoneNumber, 'ESPERANDO_TIPO_CONSULTA');
      return `📋 *Seleccioná la materia correspondiente a tu consulta:*\n\n` +
             `👨‍👩‍👧‍👦 1. *Familia* (Divorcios, Alimentos, Régimen de Comunicación)\n` +
             `💼 2. *Laboral / Accidentes de Trabajo* (ART)\n` +
             `📜 3. *Sucesiones*\n` +
             `🏠 4. *Desalojos*\n` +
             `👵👨‍🦳 5. *Jubilaciones y Pensiones*\n\n` +
             `Respondé con el número de la materia deseada para abrir la Ficha de Admisión NATIVA (WhatsApp Flow).`;

    case '2':
    case 'turno':
    case 'turnos':
    case 'agendar':
      setConversationState(phoneNumber, 'SUBMENU_TURNOS');
      return `📅 *Gestión de Turnos*\n\n` +
             `🅰️ *Agendar Nuevo Turno* (Abre la Ficha / Calendario)\n` +
             `🅱️ *Cancelar Turno Existente*`;

    case '3':
    case 'abogado':
    case 'hablar con un abogado':
      try {
        const lawyerPhone = process.env.STUDIO_PHONE || '5491100000000'; // Fallback a completar
        await sendWhatsAppMessage(lawyerPhone, `🚨 *ALERTA DE PRIORIDAD*\n\nEl cliente con número +${phoneNumber} ha solicitado hablar urgentemente con un abogado.`);
      } catch (error) {
        console.error('⚠️ Error al enviar alerta al abogado:', error);
      }
      return `🚨 *Solicitud de Atención Prioritaria*\n\n` +
             `Hemos notificado a la abogada sobre tu solicitud para que se ponga en contacto con vos a la brevedad dentro del horario comercial.`;

    case '4':
    case 'horarios':
    case 'ubicacion':
    case 'horarios y ubicacion':
      return `📍 *Horarios & Ubicación - Estudio Jurídico Escobar & Asociados*\n\n` +
             `🕒 *Atención Presencial y Telefónica:* Lunes a Viernes de 09:00 a 18:00 hs.\n` +
             `🏢 *Dirección:* (Ingresar dirección de la oficina)\n` +
             `🗺️ *Google Maps:* (Enlace directo a Google Maps)\n` +
             `📞 *Teléfono alternativo:* (Número directo)\n\n` +
             `Escribí *MENU* para regresar al inicio.`;

    default:
      return `⚠️ Lo siento, esa opción no se encuentra vigente o no la entendí.\n\n` +
             `Por favor, escribí un *número del 1 al 4* o la palabra *MENU* para ver las opciones disponibles.`;
  }
}

/**
 * Devuelve el mensaje de bienvenida con el menú principal.
 * Agrega un prefijo si se escribe fuera del horario comercial, y solo lo hace la primera vez.
 * @param {boolean} mostrarAvisoFueraHorario Indica si se debe añadir el aviso de fuera de horario.
 * @returns {string}
 */
function mensajeMenuPrincipal(mostrarAvisoFueraHorario = false) {
  let mensaje = '';
  
  if (mostrarAvisoFueraHorario) {
    mensaje += `🌙 *Atención fuera de horario comercial*\nNuestro horario de atención presencial/telefónica es de Lunes a Viernes de 09:00 a 18:00 hs. Podés completar tu consulta o gestión ahora mismo y la abogada evaluará tu ficha para contactarte a primera hora del próximo día hábil.\n-----------------------------------------\n\n`;
  }
  
  mensaje += `👋 ¡Hola! Bienvenido/a al *Estudio Jurídico Escobar & Asociados*. ⚖️\n\n` +
         `Por favor, respondé con el número de la opción deseada:\n\n` +
         `1️⃣ *Iniciar Consulta*\n` +
         `2️⃣ *Agendar / Ver Turnos*\n` +
         `3️⃣ *Hablar con un Abogado*\n` +
         `4️⃣ *Horarios y Ubicación*`;
         
  return mensaje;
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

/**
 * Verifica si la hora actual en Argentina está fuera del horario comercial.
 * Horario comercial: Lunes a Viernes de 9:00 a 18:00 hs.
 * @returns {boolean}
 */
function esFueraDeHorario() {
  const options = { timeZone: 'America/Buenos_Aires', hour12: false, hour: 'numeric', weekday: 'numeric' };
  // Usamos el locale en-US para asegurar que el parsing sea predecible
  const argTimeStr = new Date().toLocaleString("en-US", { timeZone: "America/Buenos_Aires" });
  const argDate = new Date(argTimeStr);
  
  const day = argDate.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const hour = argDate.getHours(); // 0 a 23

  const isWeekend = day === 0 || day === 6;
  const isOutHours = hour < 9 || hour >= 18;

  return isWeekend || isOutHours;
}

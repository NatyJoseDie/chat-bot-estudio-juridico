/**
 * Controlador de la lógica del bot de WhatsApp - Estudio Jurídico Escobar & Asociados
 * Flujo optimizado con formularios Tally específicos para Familia y derivación directa.
 */

import {
  getOrCreateConversation,
  setConversationState,
  resetConversation,
} from '../services/conversationState.service.js';

import { sendCancellationEmail } from '../services/email.service.js';
import { sendWhatsAppMessage } from '../services/whatsapp.service.js';

// ============================================================
// CONFIGURACIÓN DE ENLACES (Tally y Turnos)
// ============================================================
const FORMULARIOS_TALLY = {
  DIVORCIO: 'https://tally.so/r/KYd8Ng',
  ALIMENTOS: 'https://tally.so/r/VpEl1v',
  COMUNICACION: 'https://tally.so/r/YjDz7N',
};

// Si creás un link en Cal.com conectado al Google Calendar del estudio, pegalo acá:
const LINK_AGENDAR_TURNO = ''; // Ej: 'https://cal.com/estudio-escobar/consulta'

// ============================================================
// PROCESADOR PRINCIPAL
// ============================================================
export async function processUserMessage(phoneNumber, incomingText) {
  const normalizedText = incomingText.trim().toLowerCase();
  const conversation = getOrCreateConversation(phoneNumber);
  const { state, tempData } = conversation;

  // 1. COMANDO GLOBAL: Volver al menú principal en cualquier momento
  const saludosYMenu = ['menu', 'menú', '0', 'hola', 'buenas', 'buen dia', 'buen día', 'buenas tardes', 'buenas noches'];
  if (saludosYMenu.includes(normalizedText)) {
    resetConversation(phoneNumber);
    const avisoHorario = esFueraDeHorario();
    setConversationState(phoneNumber, 'MENU', { warnedOutOfHours: avisoHorario });
    return mensajeMenuPrincipal(avisoHorario);
  }

  // 2. ATAJOS DIRECTOS: Si escribe el trámite de familia desde cualquier lado
  if (normalizedText.includes('divorcio')) {
    resetConversation(phoneNumber);
    return respuestaFormularioFamilia('Divorcio / Separación', FORMULARIOS_TALLY.DIVORCIO);
  }
  if (normalizedText.includes('alimento') || normalizedText.includes('cuota')) {
    resetConversation(phoneNumber);
    return respuestaFormularioFamilia('Alimentos y Cuota Alimentaria', FORMULARIOS_TALLY.ALIMENTOS);
  }
  if (normalizedText.includes('comunicacion') || normalizedText.includes('comunicación') || normalizedText.includes('visita')) {
    resetConversation(phoneNumber);
    return respuestaFormularioFamilia('Régimen de Comunicación y Contacto', FORMULARIOS_TALLY.COMUNICACION);
  }

  // 3. MÁQUINA DE ESTADOS
  switch (state) {
    // --------------------------------------------------------
    // ESTADO: ESPERANDO_TIPO_CONSULTA
    // --------------------------------------------------------
    case 'ESPERANDO_TIPO_CONSULTA': {
      // Opción 1: Familia -> Abre submenú con los 3 formularios de Tally
      if (normalizedText === '1' || normalizedText.includes('familia')) {
        setConversationState(phoneNumber, 'SUBMENU_FAMILIA');
        return `👨‍👩‍👧‍👦 *Derecho de Familia*\n` +
          `✅ *Primera evaluación sin cargo.*\n\n` +
          `Seleccioná el motivo específico de tu consulta para enviarte la ficha correspondiente:\n\n` +
          `🅰️ *Divorcio / Separación*\n` +
          `🅱️ *Alimentos y Cuota Alimentaria*\n` +
          `©️ *Régimen de Comunicación y Contacto* (escribí *C*)\n\n` +
          `Respondé con la letra *A*, *B* o *C* _(o escribí *MENU* para volver atrás)_`;
      }

      // Opción 2: Laboral / ART (Gratuita - deriva a coordinación)
      if (['2', 'laboral', 'trabajo', 'despido', 'art', 'accidente'].some(k => normalizedText.includes(k))) {
        resetConversation(phoneNumber);
        await notificarConsultaGeneral(phoneNumber, 'Derecho Laboral / ART (Consulta Gratuita)');
        return `💼 *Consulta Derecho Laboral / ART*\n` +
          `✅ *Primera evaluación sin cargo.*\n\n` +
          `Ya notificamos a la abogada sobre tu consulta laboral para que se comunique con vos a la brevedad.\n\n` +
          `_(Escribí *MENU* si necesitás volver al inicio)._`;
      }

      // Opciones 3, 4, 5: Sucesiones, Desalojos, Jubilaciones (Pagas)
      if (['3', '4', '5', 'sucesiones', 'sucesion', 'desalojos', 'desalojo', 'jubilaciones', 'jubilacion', 'pensiones'].some(k => normalizedText.includes(k))) {
        resetConversation(phoneNumber);
        await notificarConsultaGeneral(phoneNumber, `Consulta Patrimonial/Previsional (Opción: ${incomingText.trim()})`);
        return `⚖️ *Consulta Patrimonial / Previsional*\n` +
          `_(Sucesiones, Desalojos, Jubilaciones y Pensiones)_\n\n` +
          `💳 *Valor de la consulta técnica:* $20.000 ARS *(descontable si iniciás el trámite con el estudio)*.\n\n` +
          `Ya dimos aviso al equipo del estudio para coordinar tu evaluación y enviarte los datos.\n\n` +
          `_(Escribí *MENU* para volver al inicio)._`;
      }

      return `⚠️ Opción no válida.\n\n` +
        `Respondé con un *número del 1 al 5* según tu consulta, o escribí *MENU* para volver atrás.`;
    }

    // --------------------------------------------------------
    // ESTADO: SUBMENU_FAMILIA (Los 3 formularios de Tally)
    // --------------------------------------------------------
    case 'SUBMENU_FAMILIA': {
      if (normalizedText === 'a' || normalizedText.includes('divorcio')) {
        resetConversation(phoneNumber);
        return respuestaFormularioFamilia('Divorcio / Separación', FORMULARIOS_TALLY.DIVORCIO);
      }

      if (normalizedText === 'b' || normalizedText.includes('alimento') || normalizedText.includes('cuota')) {
        resetConversation(phoneNumber);
        return respuestaFormularioFamilia('Alimentos y Cuota Alimentaria', FORMULARIOS_TALLY.ALIMENTOS);
      }

      if (normalizedText === 'c' || normalizedText.includes('comunicacion') || normalizedText.includes('comunicación') || normalizedText.includes('contacto')) {
        resetConversation(phoneNumber);
        return respuestaFormularioFamilia('Régimen de Comunicación y Contacto', FORMULARIOS_TALLY.COMUNICACION);
      }

      return `⚠️ Opción no válida.\n\n` +
        `Por favor respondé con la letra *A* (Divorcio), *B* (Alimentos) o *C* (Régimen de Comunicación), o escribí *MENU* para volver al inicio.`;
    }

    // --------------------------------------------------------
    // ESTADO: SUBMENU_TURNOS
    // --------------------------------------------------------
    case 'SUBMENU_TURNOS': {
      if (normalizedText === 'a' || normalizedText.includes('agendar') || normalizedText.includes('nuevo')) {
        resetConversation(phoneNumber);

        if (LINK_AGENDAR_TURNO) {
          return `📅 *Agendar Nuevo Turno*\n\n` +
            `Elegí el día y horario disponible (presencial o virtual) directamente en nuestra agenda online:\n` +
            `👉 ${LINK_AGENDAR_TURNO}\n\n` +
            `_(Recibirás la confirmación automática. Escribí *MENU* para volver al inicio)._`;
        }

        await notificarConsultaGeneral(phoneNumber, 'Solicitud de Turno Presencial/Virtual');

        return `📅 *Agendar Nuevo Turno*\n\n` +
          `Ya notificamos a la secretaria del estudio para coordinar un día y horario con vos.\n\n` +
          `Si tu consulta es de *Familia* y aún no completaste la ficha previa, podés adelantarla acá:\n` +
          `• *Divorcio:* ${FORMULARIOS_TALLY.DIVORCIO}\n` +
          `• *Alimentos:* ${FORMULARIOS_TALLY.ALIMENTOS}\n` +
          `• *Comunicación y Contacto:* ${FORMULARIOS_TALLY.COMUNICACION}\n\n` +
          `_(Escribí *MENU* para volver al inicio)._`;
      }

      if (normalizedText === 'b' || normalizedText.includes('cancelar')) {
        setConversationState(phoneNumber, 'ESPERANDO_NOMBRE_CANCELACION');
        return `❌ *Cancelar Turno*\n\n` +
          `Por favor, escribinos tu *nombre y apellido completo* con el que registraste el turno.\n\n` +
          `_(Escribí *MENU* para volver al inicio)._`;
      }

      return `⚠️ Opción no válida.\n\n` +
        `Escribí *A* para agendar un turno o *B* para cancelar (o *MENU* para volver al inicio).`;
    }

    // --------------------------------------------------------
    // ESTADO: ESPERANDO_NOMBRE_CANCELACION
    // --------------------------------------------------------
    case 'ESPERANDO_NOMBRE_CANCELACION': {
      const nombre = incomingText.trim();
      if (nombre.length < 2) {
        return `⚠️ Por favor, escribí tu nombre y apellido completo.\n\n_(O escribí *MENU* para volver atrás)._`;
      }

      try {
        await sendCancellationEmail(phoneNumber, capitalizar(nombre));
      } catch (error) {
        console.error(`⚠️ Error al enviar mail de cancelación para ${phoneNumber}:`, error);
      }

      resetConversation(phoneNumber);
      return `✅ *Solicitud Recibida*\n\n` +
        `Notificamos al estudio sobre la cancelación del turno a nombre de *${capitalizar(nombre)}* para liberar la agenda.\n\n` +
        `¡Muchas gracias por avisar! Escribí *MENU* si necesitás otra gestión.`;
    }

    // --------------------------------------------------------
    // ESTADO: POST_TALLY (Respuesta tras enviar formulario)
    // --------------------------------------------------------
    case 'POST_TALLY': {
      const afirmaciones = ['si', 'sí', 's', 'quiero', 'otra', 'otra consulta', 'dale', 'ok'];
      const negaciones = ['no', 'n', 'nada', 'eso es todo', 'listo', 'gracias', 'muchas gracias', 'no gracias'];

      if (afirmaciones.includes(normalizedText)) {
        resetConversation(phoneNumber);
        const avisoHorario = esFueraDeHorario();
        setConversationState(phoneNumber, 'MENU', { warnedOutOfHours: avisoHorario });
        return mensajeMenuPrincipal(avisoHorario);
      }

      if (negaciones.includes(normalizedText)) {
        resetConversation(phoneNumber);
        return `🙏 *¡Muchas gracias por comunicarte con Estudio Jurídico Escobar & Asociados!*\n\n` +
          `La abogada ya recibió toda tu información y se va a contactar con vos a la brevedad dentro de nuestro horario de atención (Lunes a Viernes de 09:00 a 18:00 hs).\n\n` +
          `_(Si en otro momento necesitás hacer una nueva gestión, escribinos *MENU*)._`;
      }

      return `Por favor, respondé *SÍ* (o escribí *MENU*) si querés hacer otra consulta, o *NO* para finalizar.`;
    }

    // --------------------------------------------------------
    // ESTADO: MENU (default)
    // --------------------------------------------------------
    case 'MENU':
    default: {
      return await manejarOpcionMenu(phoneNumber, normalizedText, tempData);
    }
  }
}

// ============================================================
// OPCIONES DEL MENÚ PRINCIPAL
// ============================================================
async function manejarOpcionMenu(phoneNumber, normalizedText, tempData) {
  switch (normalizedText) {
    case '1':
    case 'consulta':
    case 'consultas':
    case 'iniciar consulta':
      setConversationState(phoneNumber, 'ESPERANDO_TIPO_CONSULTA');
      return `📋 *Seleccioná la materia de tu consulta:*\n\n` +
        `1️⃣ *Familia* (Divorcio, Alimentos, Régimen de Comunicación)\n` +
        `2️⃣ *Laboral / Accidentes de Trabajo (ART)*\n` +
        `3️⃣ *Sucesiones*\n` +
        `4️⃣ *Desalojos*\n` +
        `5️⃣ *Jubilaciones y Pensiones*\n\n` +
        `Respondé con el *número* de la opción (del 1 al 5) para continuar.\n` +
        `_(O escribí *MENU* para volver atrás)._`;

    case '2':
    case 'turno':
    case 'turnos':
    case 'agendar':
      setConversationState(phoneNumber, 'SUBMENU_TURNOS');
      return `📅 *Gestión de Turnos*\n\n` +
        `🅰️ *Agendar Nuevo Turno*\n` +
        `🅱️ *Cancelar Turno Existente*\n\n` +
        `Respondé con la letra *A* o *B* (o escribí *MENU* para volver al inicio).`;

    case '3':
    case 'abogado':
    case 'hablar con un abogado':
      await notificarConsultaGeneral(phoneNumber, '🚨 ALERTA DE PRIORIDAD: Solicita hablar con un abogado');
      return `🚨 *Solicitud de Atención Prioritaria*\n\n` +
        `Ya notificamos a la abogada sobre tu mensaje para que se comunique con vos a la brevedad dentro del horario comercial (Lunes a Viernes de 09:00 a 18:00 hs).`;

    case '4':
    case 'horarios':
    case 'ubicacion':
    case 'horarios y ubicacion':
      return `📍 *Horarios y Ubicación - Estudio Jurídico Escobar & Asociados*\n\n` +
        `🕒 *Atención:* Lunes a Viernes de 09:00 a 18:00 hs.\n` +
        `🏢 *Dirección:* (Completar dirección del estudio)\n` +
        `🗺️ *Google Maps:* (Completar enlace de Maps)\n\n` +
        `Escribí *MENU* para volver al inicio.`;

    default: {
      const avisoHorario = esFueraDeHorario() && !tempData?.warnedOutOfHours;
      if (avisoHorario) {
        setConversationState(phoneNumber, 'MENU', { warnedOutOfHours: true });
      }
      return mensajeMenuPrincipal(avisoHorario);
    }
  }
}

// ============================================================
// HELPERS
// ============================================================
function respuestaFormularioFamilia(tituloTramite, linkTally) {
  return `👨‍👩‍👧‍👦 *Ficha de Admisión: ${tituloTramite}*\n` +
    `✅ *Primera evaluación sin cargo.*\n\n` +
    `Completá este breve formulario confidencial para que la abogada analice tu caso antes de contactarte:\n` +
    `👉 ${linkTally}\n\n` +
    `_(Una vez enviado, nos llega automáticamente y te escribimos a la brevedad. Escribí *MENU* si necesitás volver al inicio)._`;
}

async function notificarConsultaGeneral(phoneNumber, detalle) {
  try {
    const lawyerPhone = process.env.STUDIO_PHONE;
    if (!lawyerPhone) return;
    await sendWhatsAppMessage(
      lawyerPhone,
      `📩 *NUEVA SOLICITUD EN EL BOT*\n• Teléfono: +${phoneNumber}\n• Motivo: ${detalle}`
    );
  } catch (error) {
    console.error('⚠️ Error al notificar al estudio por WhatsApp:', error);
  }
}

function mensajeMenuPrincipal(mostrarAvisoFueraHorario = false) {
  let mensaje = '';

  if (mostrarAvisoFueraHorario) {
    mensaje += `🌙 *Atención fuera de horario comercial*\n` +
      `Nuestro horario presencial/telefónico es de Lunes a Viernes de 09:00 a 18:00 hs. Podés completar tu ficha ahora mismo y la abogada la evaluará a primera hora del próximo día hábil.\n` +
      `-----------------------------------------\n\n`;
  }

  mensaje += `👋 ¡Hola! Bienvenido/a al *Estudio Jurídico Escobar & Asociados*. ⚖️\n\n` +
    `Por favor, respondé con el *número* de la opción deseada:\n\n` +
    `1️⃣ *Iniciar Consulta*\n` +
    `2️⃣ *Agendar / Cancelar Turno*\n` +
    `3️⃣ *Hablar con un Abogado*\n` +
    `4️⃣ *Horarios y Ubicación*`;

  return mensaje;
}

function capitalizar(texto) {
  if (!texto) return '';
  return texto
    .split(' ')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

function esFueraDeHorario() {
  const argTimeStr = new Date().toLocaleString('en-US', { timeZone: 'America/Buenos_Aires' });
  const argDate = new Date(argTimeStr);
  const day = argDate.getDay(); // 0 = Dom, 6 = Sáb
  const hour = argDate.getHours();
  return day === 0 || day === 6 || hour < 9 || hour >= 18;
}
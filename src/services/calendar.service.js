/**
 * Servicio para interactuar con Google Calendar API v3 mediante Service Account.
 *
 * Ventaja de Service Account vs OAuth2: NO requiere consentimiento del usuario
 * ni refresh tokens. Basta con compartir el calendario del estudio con la
 * dirección de correo del Service Account (editor).
 *
 * Docs:
 *   - google.auth.GoogleAuth (JWT): https://googleapis.dev/nodejs/google-auth-library/latest/
 *   - calendar v3 events.insert: https://developers.google.com/calendar/api/v3/reference/events/insert
 */

import { google } from 'googleapis';

// ============================================================
// CONFIGURACIÓN SERVICE ACCOUNT
// ============================================================
//
// Hay 2 formas de cargar las credenciales:
//   A) Un solo JSON compactado en una variable de entorno (más práctico):
//        GOOGLE_SERVICE_ACCOUNT_JSON = '{
//          "type":"service_account",
//          "project_id":"estudio-juridico-XXX",
//          "private_key_id":"XXX",
//          "private_key":"-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----\n",
//          "client_email":"bot-calendario@....iam.gserviceaccount.com",
//          "client_id":"XXX",
//          "auth_uri":"https://accounts.google.com/o/oauth2/auth",
//          "token_uri":"https://oauth2.googleapis.com/token",
//          "auth_provider_x509_cert_url":"...",
//          "client_x509_cert_url":"..."
//        }'
//
//        +   GOOGLE_CALENDAR_ID    = "ID_DEL_CALENDARIO_PRINCIPAL@group.calendar.google.com"
//            (el email del calendario del estudio)
//
//   B) Archivo credentials.json en la raíz (fallback si la variable de entorno no existe):
//        ./google-service-account.json
//
//   IMPORTANTE: En Google Calendar, compartí tu calendario con el client_email
//   del service account con rol "Editor", de lo contrario no podrá crear eventos.

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Obtiene una instancia autenticada de cliente JWT de Google.
 * @returns {Promise<google.auth.JWT>}
 */
async function getAuthenticatedClient() {
  // 1) Intentar cargar desde variable de entorno (JSON compactado inline)
  const envJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  let credentials;

  if (envJson) {
    try {
      credentials = JSON.parse(envJson.trim().replace(/\r?\n/g, '\\n'));
    } catch (err) {
      throw new Error(
        `GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido. ` +
        `Asegurate de que los \n de la private_key estén preservados.`
      );
    }
  } else {
    // 2) Fallback: leer desde archivo local
    try {
      // Usamos dynamic import JSON require-less para ESM:
      const { readFileSync } = await import('fs');
      const { default: path } = await import('path');
      const filepath = path.resolve(process.cwd(), 'google-service-account.json');
      credentials = JSON.parse(readFileSync(filepath, 'utf8'));
    } catch (err) {
      throw new Error(
        `No se encontraron credenciales de Google Calendar. ` +
        `Definí la variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON o ` +
        `creá el archivo google-service-account.json en la raíz del proyecto.`
      );
    }
  }

  if (!credentials || !credentials.client_email || !credentials.private_key) {
    throw new Error(
      `Credenciales de Google Calendar incompletas. ` +
      `Faltan client_email y/o private_key.`
    );
  }

  const client = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: SCOPES,
  });

  await client.authorize();
  return client;
}

/**
 * Parsea el texto que escribió el usuario (fecha y franja horaria) en dos
 * objetos Date para usar en Google Calendar.
 *
 * Reconoce estos patrones (case-insensitive, flexible):
 *   "lunes 30 de septiembre 10hs"
 *   "30/09/2026 a las 10:00 hs"
 *   "30-09-2026 10:30 tarde"
 *   "mañana 14hs"
 *   "01/10 mañana"
 *
 * Por defecto, todas las reuniones duran 1 hora.
 *
 * @param {string} textoFecha - Texto libre escrito por el usuario.
 * @param {number} [duracionMinutos=60] - Duración por defecto de la reunión.
 * @returns {{ start: Date, end: Date, textoHumano: string }}
 */
export function parseFechaYHora(textoFecha, duracionMinutos = 60) {
  const texto = textoFecha.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // Mapeo de meses
  const mapMeses = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    ener: 0, febr: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, agost: 7, sept: 8, oct: 9, nov: 10, dic: 11,
  };

  // Mapeo de días de la semana a la PRÓXIMA ocurrencia
  const mapDiasSemana = {
    lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6, domingo: 0,
  };

  const ahora = new Date();
  let fechaAsignada = null; // objeto Date para el día elegido (aún sin hora)
  let hora = 10;
  let minutos = 0;

  // ============================================================
  // 1) Detección de HORA
  // ============================================================
  // Patrones típicos: "10hs", "10:30", "a las 14", "14:00", "4pm", "9 AM", etc.
  const regexHora = /(\d{1,2})\s*[:.]\s*(\d{1,2})/;
  const regexHoraSimple = /(\d{1,2})\s*(?:hs|h|hr|horas?)/i;
  const regexHora12 = /(\d{1,2})\s*(am|pm)/i;

  let match;
  if ((match = regexHora.exec(texto))) {
    hora = parseInt(match[1], 10);
    minutos = parseInt(match[2], 10);
  } else if ((match = regexHora12.exec(texto))) {
    hora = parseInt(match[1], 10);
    if (match[2].toLowerCase() === 'pm' && hora < 12) hora += 12;
    if (match[2].toLowerCase() === 'am' && hora === 12) hora = 0;
  } else if ((match = regexHoraSimple.exec(texto))) {
    hora = parseInt(match[1], 10);
    minutos = 0;
  }

  // Si el texto dice "tarde" y la hora es <= 12, asumimos PM
  if (/tarde|siesta/.test(texto) && hora > 0 && hora < 12) {
    hora += 12;
  }
  // Si el texto dice "mañana" y la hora >= 13, ajustamos a AM
  if (/mañana|manana/.test(texto) && hora > 12) {
    hora -= 12;
  }

  // ============================================================
  // 2) Detección de DÍA
  // ============================================================

  // 2.a) Día específico: mañana / pasado mañana / hoy
  if (/pasado\s*mañana|pasado\s*manana/.test(texto)) {
    fechaAsignada = new Date(ahora);
    fechaAsignada.setDate(fechaAsignada.getDate() + 2);
  } else if (/mañana|manana/.test(texto) && !/[0-9]/.test(texto.replace(/(\d{1,2})[:h]/g, ''))) {
    // "mañana" sólo si no hay un número de fecha específico escrito aparte de la hora
    fechaAsignada = new Date(ahora);
    fechaAsignada.setDate(fechaAsignada.getDate() + 1);
  } else if (/hoy|hoy mismo/.test(texto)) {
    fechaAsignada = new Date(ahora);
  }

  // 2.b) Día de la semana: "lunes", "martes", ...
  if (!fechaAsignada) {
    for (const [key, dia] of Object.entries(mapDiasSemana)) {
      const regex = new RegExp(`(^|\\s)${key}(\\s|$)`, 'i');
      if (regex.test(texto)) {
        const hoy = ahora.getDay();
        let diff = dia - hoy;
        if (diff <= 0) diff += 7; // siempre la próxima ocurrencia
        fechaAsignada = new Date(ahora);
        fechaAsignada.setDate(ahora.getDate() + diff);
        break;
      }
    }
  }

  // 2.c) Fecha numérica: "30/09/2026", "30-09", "30 de septiembre"
  if (!fechaAsignada) {
    const regexBarra = /(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/;
    const matchBarra = regexBarra.exec(texto);
    if (matchBarra) {
      const dia = parseInt(matchBarra[1], 10);
      const mes = parseInt(matchBarra[2], 10) - 1;
      let anio = matchBarra[3] ? parseInt(matchBarra[3], 10) : ahora.getFullYear();
      if (anio < 100) anio += 2000;
      fechaAsignada = new Date(anio, mes, dia);
    }
  }

  // 2.d) Formato "30 de septiembre" (mes en letras)
  if (!fechaAsignada) {
    const regexMesLetras = /(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ener|febr|mar|abr|may|jun|jul|agost|sept|oct|nov|dic)\s*(?:de\s+(\d{2,4}))?/i;
    const matchMes = regexMesLetras.exec(texto);
    if (matchMes) {
      const dia = parseInt(matchMes[1], 10);
      const mes = mapMeses[matchMes[2].toLowerCase()];
      let anio = matchMes[3] ? parseInt(matchMes[3], 10) : ahora.getFullYear();
      if (anio < 100) anio += 2000;
      fechaAsignada = new Date(anio, mes, dia);
    }
  }

  // ============================================================
  // 3) Fallback: si no se pudo detectar nada, próxima hora hábil.
  // ============================================================
  if (!fechaAsignada) {
    fechaAsignada = new Date(ahora);
    fechaAsignada.setDate(fechaAsignada.getDate() + 1);
  }

  // Validar limites de hora
  if (hora < 0 || hora > 23) hora = 10;
  if (minutos < 0 || minutos > 59) minutos = 0;

  fechaAsignada.setHours(hora, minutos, 0, 0);

  const start = new Date(fechaAsignada);
  const end = new Date(fechaAsignada);
  end.setMinutes(end.getMinutes() + duracionMinutos);

  const textoHumano =
    start.toLocaleString('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return { start, end, textoHumano };
}

/**
 * Crea un evento en Google Calendar para una reunión del estudio.
 *
 * @param {object} turnoData - Datos del turno (de la tabla turnos en Supabase)
 * @param {object} clienteData - Datos del cliente
 * @param {{ start: Date, end: Date }} fecha - Fechas calculadas desde parseFechaYHora
 * @param {string} [fechaTexto] - Texto humano del horario elegido por el usuario
 * @returns {Promise<{ id: string, htmlLink: string, hangoutLink?: string }>}
 */
export async function createCalendarEvent(turnoData, clienteData, fecha, fechaTexto) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const auth = await getAuthenticatedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const startISO = fecha.start.toISOString();
  const endISO = fecha.end.toISOString();

  const nombreCliente = clienteData.nombre_completo || 'Cliente sin nombre';
  const telefono = clienteData.telefono || '';
  const motivo = turnoData.resumen_caso || 'Sin motivo';

  // Descripción del evento (info útil para los abogados del estudio)
  const description = `
⚖️ Estudio Jurídico Escobar & Asociados
Turno solicitado automáticamente desde el Bot de WhatsApp.

👤 CLIENTE:
• Nombre: ${nombreCliente}
• Teléfono: ${telefono}
• Link WhatsApp: https://wa.me/${String(telefono).replace(/[^\d]/g, '')}

📋 MOTIVO DE LA CONSULTA:
${motivo}

⏰ FRANJA ELEGIDA POR EL CLIENTE:
${fechaTexto || '-'}
  `.trim();

  const requestBody = {
    summary: `⚖️ Escobar & Asociados | Turno - ${nombreCliente}`,
    description,
    start: {
      dateTime: startISO,
      timeZone: 'America/Argentina/Buenos_Aires',
    },
    end: {
      dateTime: endISO,
      timeZone: 'America/Argentina/Buenos_Aires',
    },
    // Por defecto crea meet de Google Meet automáticamente (útil para reuniones virtuales)
    conferenceDataVersion: 1,
    conferenceData: {
      createRequest: {
        requestId: `turno-${turnoData.id}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 1440 }, // 24 hs antes, al correo del estudio
        { method: 'popup', minutes: 60 },   // 1 hora antes, popup en Calendar
      ],
    },
  };

  const res = await calendar.events.insert({
    calendarId,
    requestBody,
  });

  const event = res.data;

  return {
    id: event.id,
    htmlLink: event.htmlLink,
    hangoutLink: event.hangoutLink,
    start: event.start,
    end: event.end,
  };
}

/**
 * Servicio de notificaciones por correo electrónico mediante Resend.
 *
 * Documentación Resend: https://resend.com/docs/send-with-nodejs
 */

import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('Falta variable de entorno RESEND_API_KEY');
}

const resend = new Resend(process.env.RESEND_API_KEY);

// ============================================================
// LÓGICA DE CATEGORIZACIÓN DEL CASO (por keywords en el motivo)
// ============================================================

const CATEGORIAS = [
  {
    nombre: 'Derecho de Familia',
    badgeColor: '#f59e0b',
    keywords: [
      'divorcio', 'divorci', 'mutuo acuerdo', 'matrimonio', 'separació',
      'alimento', 'alimentos', 'pension', 'pensión', 'cuota alimentaria',
      'cuidado personal', 'régimen de contacto', 'visita', 'visitas',
      'tenenci', 'hijo', 'hija', 'herencia', 'sucesorio', 'sucesión',
      'adopción', 'adopcion'
    ],
  },
  {
    nombre: 'Derecho Laboral',
    badgeColor: '#3b82f6',
    keywords: [
      'despido', 'despid', 'indemnizaci', 'indemnizacion',
      'trabajo', 'trabajador', 'trabajadora', 'empleado', 'empleada',
      'empleador', 'recibo', 'sueldo', 'salario', 'horas extra',
      'accidente de trabajo', 'art', 'riesg', 'sindicato',
      'preaviso', 'maternidad', 'licencia'
    ],
  },
  {
    nombre: 'Derecho Civil',
    badgeColor: '#8b5cf6',
    keywords: [
      'contrato', 'alquiler', 'alquil', 'inquilino', 'propietario',
      'locaci', 'daños', 'daño y perjuicio', 'indemnización por daños',
      'deuda', 'acreedor', 'prestamo', 'préstamo', 'cheque',
      'embargo', 'prescripci', 'venta', 'compraventa', 'permuta'
    ],
  },
  {
    nombre: 'Derecho Comercial',
    badgeColor: '#14b8a6',
    keywords: [
      'empresa', 'sociedad', 's.a.', 'srl', 'monotributo', 'responsable inscripto',
      'iva', 'afip', 'impuesto', 'impositiv', 'factur',
      'quiebra', 'concurs', 'contrato comercial', 'societari', 'marca', 'patente'
    ],
  },
  {
    nombre: 'Derecho Penal / Urgencia',
    badgeColor: '#ef4444',
    keywords: [
      'detencion', 'detención', 'policía', 'policia', 'comisaria', 'comisaría',
      'penal', 'delito', 'denuncia', 'acusación', 'acusacion', 'juicio oral',
      'victima', 'víctima', 'robo', 'violencia', 'lesiones', 'abuso'
    ],
  },
];

/**
 * Detecta la categoría del caso buscando keywords en el motivo de la consulta.
 * Si no encuentra ninguna coincidencia, devuelve "Consulta General".
 *
 * @param {string} motivo
 * @returns {{ nombre: string, badgeColor: string }}
 */
export function categorizarCaso(motivo = '') {
  const texto = motivo.toLowerCase();

  for (const categoria of CATEGORIAS) {
    const hit = categoria.keywords.some(k => texto.includes(k.toLowerCase()));
    if (hit) return categoria;
  }

  return {
    nombre: 'Consulta General',
    badgeColor: '#6b7280',
  };
}

/**
 * Construye el HTML del correo de notificación de NUEVO TURNO / CASO.
 *
 * @param {{ id: string, telefono: string, nombre_completo: string, email?: string|null }} clienteData
 * @param {{ id: string, resumen_caso: string, estado: string, creado_en: string|Date, fecha_turno?: string|Date|null }} turnoData
 * @returns {string} HTML listo para enviar
 */
function buildNewCaseHtml(clienteData, turnoData) {
  const nombre = clienteData.nombre_completo || 'Sin nombre';
  const telefono = clienteData.telefono || 'Sin teléfono';
  // Limpiamos el teléfono para wa.me (solo dígitos, sin + ni espacios)
  const telefonoLimpio = String(telefono).replace(/[^\d]/g, '');
  const motivo = turnoData.resumen_caso || 'Sin motivo';
  const estado = turnoData.estado || 'pendiente';
  const fechaSolicitud = turnoData.creado_en
    ? new Date(turnoData.creado_en).toLocaleString('es-AR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

  const estadoColor =
    estado === 'pendiente' ? '#f59e0b' :
    estado === 'confirmado' ? '#10b981' :
    estado === 'cancelado' ? '#ef4444' : '#6b7280';

  const estadoText =
    estado === 'pendiente' ? 'Pendiente de gestión' :
    estado === 'confirmado' ? 'Confirmado' :
    estado === 'cancelado' ? 'Cancelado' : estado;

  // Detectamos categoría del caso
  const categoria = categorizarCaso(motivo);

  // Propiedades auxiliares que envía el controlador (no se guardan en la base)
  const fechaHumano = turnoData._fechaHumano ||
    (turnoData.fecha_turno
      ? new Date(turnoData.fecha_turno).toLocaleString('es-AR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Aún NO asignada - coordinar manualmente');

  const gcalLink = turnoData._gcalLink || null;
  const gcalMeetLink = turnoData._gcalMeetLink || null;

  return `
<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: #f3f4f6;
    padding: 30px 15px;
    color: #111827;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 10px 25px rgba(0,0,0,0.08);
  }
  .header {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #ffffff;
    padding: 32px 30px;
    text-align: center;
  }
  .header .badge {
    display: inline-block;
    background: #00FF94;
    color: #0f172a;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.5px;
    padding: 6px 18px;
    border-radius: 999px;
    margin-bottom: 12px;
    text-transform: uppercase;
  }
  .header h1 {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .header p {
    font-size: 14px;
    opacity: 0.85;
  }
  .body {
    padding: 34px 30px;
  }
  .intro {
    font-size: 15px;
    line-height: 1.6;
    color: #374151;
    margin-bottom: 26px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 14px;
    margin-top: 26px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 18px 22px;
    margin-bottom: 12px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px dashed #e5e7eb;
    font-size: 14px;
  }
  .row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .row:first-child {
    padding-top: 0;
  }
  .label {
    color: #6b7280;
    font-weight: 500;
    font-size: 13px;
  }
  .value {
    color: #111827;
    font-weight: 600;
    text-align: right;
    margin-left: 12px;
    word-break: break-word;
  }
  .estado-badge {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 999px;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    background-color: ${estadoColor};
  }
  .categoria-badge {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 999px;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    background-color: ${categoria.badgeColor};
  }
  .btn {
    display: inline-block;
    background: linear-gradient(135deg, #111827 0%, #1e293b 100%);
    color: #ffffff !important;
    text-decoration: none;
    padding: 15px 24px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 14px;
    text-align: center;
    margin-top: 8px;
    width: 100%;
    box-sizing: border-box;
    transition: transform 0.2s ease;
  }
  .btn:hover {
    transform: translateY(-1px);
  }
  .btn-whatsapp {
    background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
    margin-bottom: 14px;
    margin-top: 14px;
  }
  .btn-calendar {
    background: linear-gradient(135deg, #4285F4 0%, #2563EB 100%);
    margin-top: 14px;
    margin-bottom: 0;
  }
  .btn-meet {
    background: linear-gradient(135deg, #00897B 0%, #00AC47 100%);
    margin-top: 12px;
    margin-bottom: 0;
  }
  .motivo-box {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-left: 5px solid #00FF94;
    border-radius: 10px;
    padding: 24px 26px;
    margin-top: 14px;
    color: #1f2937;
    line-height: 1.7;
    font-size: 14.5px;
    box-shadow: inset 0 0 0 1px rgba(0,255,148,0.06);
  }
  .footer {
    background: #f9fafb;
    padding: 22px 30px;
    border-top: 1px solid #e5e7eb;
    text-align: center;
    font-size: 12px;
    color: #6b7280;
    line-height: 1.6;
  }
  a {
    color: #065f46;
  }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">Nuevo Caso Recibido</span>
      <h1>⚖️ Estudio Jurídico Escobar & Asociados</h1>
      <p>Se registró una nueva solicitud de turno desde el Bot de WhatsApp</p>
    </div>

    <div class="body">
      <p class="intro">
        Hola equipo de <strong>Escobar & Asociados</strong>! Un cliente acaba de completar el formulario de contacto desde el bot.
        Acá tenés toda la información para gestionarlo a la brevedad.
      </p>

      <!-- Datos del cliente -->
      <div class="section-title">👤 Datos del Cliente</div>
      <div class="card">
        <div class="row">
          <span class="label">Nombre completo</span>
          <span class="value">${nombre}</span>
        </div>
        <div class="row">
          <span class="label">Teléfono</span>
          <span class="value">${telefono}</span>
        </div>
        ${clienteData.email ? `
        <div class="row">
          <span class="label">Email</span>
          <span class="value">${clienteData.email}</span>
        </div>
        ` : ''}
      </div>

      <!-- Botón directo a wa.me -->
      <a class="btn btn-whatsapp" href="https://wa.me/${telefonoLimpio}" target="_blank">
        💬 Abrir chat directo con el cliente por WhatsApp
      </a>

      <!-- Detalle del turno -->
      <div class="section-title">📋 Detalle del Turno</div>
      <div class="card">
        <div class="row">
          <span class="label">Tipo de consulta</span>
          <span class="categoria-badge">${categoria.nombre}</span>
        </div>
        <div class="row">
          <span class="label">Estado</span>
          <span class="estado-badge">${estadoText}</span>
        </div>
        <div class="row">
          <span class="label">Fecha de solicitud</span>
          <span class="value">${fechaSolicitud}</span>
        </div>
        <div class="row">
          <span class="label">Franja elegida por cliente</span>
          <span class="value">${fechaHumano}</span>
        </div>
        ${turnoData.fecha_turno ? `
        <div class="row">
          <span class="label">Fecha de turno (ISO)</span>
          <span class="value">${new Date(turnoData.fecha_turno).toLocaleString('es-AR')}</span>
        </div>
        ` : ''}
      </div>

      ${gcalLink ? `
      <a class="btn btn-calendar" href="${gcalLink}" target="_blank">
        📅 Abrir evento en Google Calendar
      </a>
      ` : ''}

      ${gcalMeetLink ? `
      <a class="btn btn-meet" href="${gcalMeetLink}" target="_blank">
        💻 Unirse directamente a la reunión por Google Meet
      </a>
      ` : ''}

      <!-- Motivo de la consulta -->
      <div class="section-title">📝 Motivo de la Consulta</div>
      <div class="motivo-box">
        ${motivo.replace(/\n/g, '<br/>')}
      </div>

    </div>

    <div class="footer">
      Mensaje enviado automáticamente por el Bot de WhatsApp de <strong>Estudio Jurídico Escobar & Asociados</strong>.<br/>
      No responder a este correo electrónico.
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Envía una notificación al correo del estudio informando sobre un NUEVO turno.
 *
 * @param {{ id: string, telefono: string, nombre_completo: string, email?: string|null }} clienteData
 * @param {{ id: string, resumen_caso: string, estado: string, creado_en: string|Date, fecha_turno?: string|Date|null }} turnoData
 * @returns {Promise<{ id?: string }>} Respuesta de Resend con el ID del correo enviado.
 */
export async function sendNewCaseEmail(clienteData, turnoData) {
  const to = process.env.STUDIO_EMAIL;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const fromName = process.env.RESEND_FROM_NAME || 'Bot Estudio Escobar & Asociados';

  if (!to) {
    throw new Error('Falta variable de entorno STUDIO_EMAIL (destinatario)');
  }

  const categoria = categorizarCaso(turnoData.resumen_caso);
  const subject = `🔔 [${categoria.nombre}] Nuevo Turno - ${clienteData.nombre_completo || 'Cliente'}`;
  const html = buildNewCaseHtml(clienteData, turnoData);

  const { data, error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  console.log(`📧 Notificación por mail enviada a ${to} | Categoría: ${categoria.nombre} | Resend ID: ${data?.id}`);
  return data;
}

/**
 * Envía un correo notificando al estudio sobre la CANCELACIÓN de un turno.
 *
 * @param {string} telefono
 * @param {string} nombreCliente
 * @returns {Promise<any>}
 */
export async function sendCancellationEmail(telefono, nombreCliente) {
  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #ef4444; color: white; padding: 20px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">❌ Solicitud de Cancelación de Turno</h2>
      </div>
      <div style="padding: 20px;">
        <p>Un cliente ha solicitado cancelar su turno a través del asistente virtual de WhatsApp.</p>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p style="margin: 5px 0;"><strong>👤 Nombre proporcionado:</strong> ${nombreCliente}</p>
          <p style="margin: 5px 0;"><strong>📱 Teléfono:</strong> +${telefono}</p>
        </div>
        <p>Por favor, revisá la agenda (Google Calendar) para liberar el espacio correspondiente.</p>
        <p style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center;">
          Notificación automática - Asistente Virtual
        </p>
      </div>
    </div>
  `;

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to: process.env.STUDIO_EMAIL,
    subject: `❌ CANCELACIÓN de turno - ${nombreCliente}`,
    html: htmlBody,
  });

  if (error) {
    throw error;
  }
  return data;
}

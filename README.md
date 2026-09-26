# ⚖️ Bot de WhatsApp - Estudio Jurídico Escobar & Asociados

Sistema automatizado de atención a clientes e integración de turnos para **Estudio Jurídico Escobar & Asociados**, desarrollado en Node.js, Express, Meta for Developers (WhatsApp Cloud API), Supabase y Google Calendar.

---

## 🛠️ Tecnologías utilizadas

* **Node.js** (ES Modules)
* **Express.js** (Framework de servidor)
* **Meta for Developers** (WhatsApp Cloud API & Webhooks)
* **Cloudflare Tunnel (`cloudflared`) / ngrok** (Exposición de servidor local a HTTPS)
* **Supabase** (Base de datos PostgreSQL para gestión de clientes, turnos y pagos)
* **Dotenv** (Manejo de variables de entorno)
* **Resend** (Envío de mails de notificación al estudio - ✅ INTEGRADO)
* **Google Calendar API v3 + Service Account** (Creación automática de eventos + Meet - ✅ INTEGRADO)
* **Mercado Pago SDK** (Pagos / seña de turno - PENDIENTE integrar)

---

## 📁 Estructura del Proyecto

```text
├── src/
│   ├── config/
│   │   └── supabase.js                 # Cliente de Supabase (Service Role Key)
│   ├── controllers/
│   │   └── bot.controller.js           # Lógica del bot + máquina de 4 estados + persistencia
│   ├── routes/
│   │   ├── health.routes.js            # GET /api/health (check de estado)
│   │   └── webhook.routes.js           # GET/POST /webhook (Meta Webhook)
│   ├── services/
│   │   ├── whatsapp.service.js         # Envío de mensajes por WhatsApp Cloud API
│   │   ├── email.service.js            # Resend - HTML premium con categorías, wa.me, GCAL, Meet
│   │   ├── calendar.service.js         # Google Calendar - Service Account + Google Meet automático
│   │   ├── clienteService.js           # CRUD clientes (Supabase)
│   │   ├── turnoService.js             # CRUD turnos (Supabase)
│   │   ├── pagoService.js              # CRUD pagos (Supabase)
│   │   └── conversationState.service.js# Manejo de estados por usuario (Map en memoria)
│   └── app.js                          # Configuración principal de Express y Middlewares
├── google-service-account.json         # (Opcional) credenciales Google Cloud (fallback si no hay .env)
├── test-flujo-turno.js                 # Script de prueba LOCAL end-to-end
├── schema.sql                          # Estructura SQL (clientes, turnos, pagos + índices + RLS)
├── .env                                # Variables de entorno (NO subir a GitHub)
├── server.js                           # Punto de entrada del servidor Node.js
└── package.json                        # Dependencias y scripts del proyecto
```

---

## ⚙️ Configuración del Entorno (.env)

Crea un archivo `.env` en la raíz del proyecto basado en la siguiente estructura:

```env
PORT=3000

# WhatsApp Cloud API (Meta)
WHATSAPP_VERIFY_TOKEN=tu_token_de_verificacion_seguro
WHATSAPP_TOKEN=tu_bearer_token_de_meta
WHATSAPP_PHONE_ID=tu_phone_number_id

# Supabase
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_supabase_service_role_key
# (Usar SERVICE_ROLE y no ANON - bypass ea Row Level Security)

# Resend - Notificaciones por mail
RESEND_API_KEY=tu_resend_api_key
RESEND_FROM_NAME="Bot Estudio Escobar & Asociados"
# Usar onboarding@resend.dev mientras no tengas verificado tu dominio real
RESEND_FROM_EMAIL=onboarding@resend.dev
# Email del estudio, destinatario de las notificaciones de nuevos turnos
STUDIO_EMAIL=estudioescobaryasociados.bot@gmail.com

# Google Calendar (Service Account)
# Opción A (recomendado para desarrollo local): deja vacío el valor de abajo
#          y crea el archivo google-service-account.json en la raíz con todo el JSON descargado.
# Opción B (deploy): coloca el JSON completo inline como string.
GOOGLE_CALENDAR_ID=estudioescobaryasociados.bot@gmail.com     # ID del calendario donde crear eventos
GOOGLE_SERVICE_ACCOUNT_JSON=
```

---

## 🚀 Instalación y Ejecución

Clonar el repositorio e instalar dependencias:

```bash
npm install
```

Iniciar el servidor en modo desarrollo:

```bash
npm run dev
```

Exponer el servidor local mediante Cloudflare Tunnel (o ngrok):

```bash
cloudflared tunnel --url http://localhost:3000
# O con ngrok: ngrok http 3000
```

**Probar el flujo COMPLETO sin necesidad de WhatsApp:**

```bash
node test-flujo-turno.js
```

Simula:
1. Saludo → menú
2. Opción "turno" → pide nombre
3. Nombre → pide motivo
4. Motivo → pide fecha y franja horaria
5. Fecha/hora → guarda cliente + turno en Supabase + intenta crear evento en Google Calendar
6. ENVÍA MAIL de notificación al estudio con categorías, botones wa.me, link a evento GCAL y Meet.

---

## 🛢️ Estructura de la Base de Datos (Supabase)

El script `schema.sql` crea / documenta las siguientes tablas principales:

| Tabla | Descripción |
|-------|-------------|
| **clientes** | Almacena `id`, `telefono` (UNIQUE), `nombre_completo`, `email`, `creado_en` |
| **turnos** | Registra solicitudes de turno con `cliente_id` (FK), `resumen_caso`, `fecha_turno` (ISO timestamp, elegido por cliente), `google_event_id` (ID del evento en GCal), `estado` (pendiente/confirmado/cancelado), `creado_en` |
| **pagos** | Pagos / señas de Mercado Pago: `turno_id` (FK), `mp_pago_id` (UNIQUE), `monto`, `estado`, `creado_en` |

Incluye:
- ✅ Índices optimizados (por teléfono, cliente, estado, fechas)
- ✅ FK con `ON DELETE CASCADE` (turnos se eliminan con el cliente)
- ✅ Row Level Security habilitado (el service role lo bypass ea)

**Primeros ALTER obligatorios en Supabase** (incluidos al principio de `schema.sql`):

```sql
-- Permitir NULL en fecha_turno (fallback por si falla el parseo temporalmente)
ALTER TABLE public.turnos ALTER COLUMN fecha_turno DROP NOT NULL;

-- Opcional pero recomendado:
ALTER TABLE public.turnos  ALTER COLUMN cliente_id      SET NOT NULL;
ALTER TABLE public.clientes ALTER COLUMN nombre_completo SET NOT NULL;
```

---

## 🤖 Flujo del Bot

```
MENÚ PRINCIPAL  ──► 1 (Consulta)     -> Información de áreas + invita a pedir turno
                ──► 2 (Turno)        -> ESPERANDO_NOMBRE
                ──► 3 (Urgencia)     -> Contacto telefónico directo
                ──► 0 o "menu"       -> Vuelve al menú en CUALQUIER estado

ESPERANDO_NOMBRE   ──► Usuario envía nombre (>=2 caracteres)  -> ESPERANDO_MOTIVO
                   ──► 0 o "menu"                              -> Menú principal

ESPERANDO_MOTIVO   ──► Usuario envía motivo (>=5 caracteres)  -> ESPERANDO_FECHA_HORA
                   ──► 0 o "menu"                              -> Menú principal

ESPERANDO_FECHA_HORA  ──► Usuario envía texto libre fecha+hora -> GUARDAR TODO
    Ejemplos aceptados por el parseador:
      • "Lunes 30/09 a las 10:30 hs"
      • "Mañana a las 14"
      • "30 de septiembre tarde"
      • "Viernes 11am"
      • "01/10 16hs"

    Al guardar:
      1. parseFechaYHora() -> fecha_turno ISO timestamp Argentina
      2. buscarOCrearCliente()
      3. registrarTurno() en Supabase con fecha_turno
      4. createCalendarEvent() en Google Calendar (crea link Meet, envía recordatorios)
      5. actualizarFechaTurno() -> graba google_event_id devuelto
      6. sendNewCaseEmail() al estudio (botón wa.me, GCAL y Meet incluidos en HTML)
      7. Responder confirmación al cliente
```

### Endpoints:

* **GET `/webhook`**: Meta valida la URL mediante `hub.verify_token` contra `WHATSAPP_VERIFY_TOKEN`.
* **POST `/webhook`**: Recibe eventos `whatsapp_business_account` de Meta → extrae el mensaje de texto → lo procesa → envía respuesta por WhatsApp. Responde `200 EVENT_RECEIVED` de inmediato para evitar reintentos.
* **GET `/api/health`**: Check de salud del servidor.

---

## 🗓️ Configurar Google Calendar (Tutorial paso a paso Service Account)

Para que el bot cree eventos en tu Google Calendar automáticamente, tenés que crear una **Service Account** (Cuenta de Servicio) en Google Cloud. No hace falta OAuth ni refresh tokens, es la forma más segura para backend.

### Paso 1: Crear un proyecto en Google Cloud
1. Entrá a https://console.cloud.google.com/
2. Creá un **New Project** y llamalo por ejemplo "Bot Estudio Jurídico".

### Paso 2: Habilitar Google Calendar API
1. En el buscador, escribí "Google Calendar API"
2. Seleccionalo y clickeá **ENABLE**.

### Paso 3: Crear la Service Account
1. Menú lateral → **IAM & Admin** → **Service Accounts**
2. **+ CREATE SERVICE ACCOUNT**
3. Nombre: `bot-calendario-estudio-juridico`
4. Click **CREATE AND CONTINUE**
5. (Rol opcional, se puede dejar vacío y darle permisos directo en el calendario) → **DONE**
6. En la lista de service accounts, entrá a la que acabás de crear
7. Pestaña **KEYS** → **ADD KEY** → **Create new key** → **JSON** → **CREATE**
8. Se descarga un JSON en tu PC. **GUARDALO bien** — es tu private key.

### Paso 4: Compartir tu Calendar con la Service Account
1. Entrá a https://calendar.google.com/
2. En el menú de la izquierda, hovereá sobre tu calendario del estudio → click en `⋮` → **Settings and sharing**
3. Scroll down hasta **Share with specific people** → **+ Add people and groups**
4. Pegá el **client_email** que está DENTRO del JSON descargado (ej: `bot-calendario@estudio-XXXX.iam.gserviceaccount.com`)
5. Permisos: **Make changes and manage sharing** (Editor) → **Send**

### Paso 5: Configurar el proyecto
Tenés 2 formas (elegí UNA):

#### Forma A) Archivo JSON local (más fácil para desarrollo local)
- Copiá el JSON descargado a la raíz del proyecto
- Renombralo exactamente a: `google-service-account.json`
- En el `.env` dejá `GOOGLE_SERVICE_ACCOUNT_JSON=` vacío (el service lo carga desde el archivo automáticamente)

#### Forma B) Variable de entorno inline (mejor para deploys / Render / Vercel)
- Abrí el JSON con un editor de texto
- Copiá TODO el contenido en una sola línea (podés reemplazar los saltos de línea reales de la private_key por `\n`)
- Pegalo como valor de `GOOGLE_SERVICE_ACCOUNT_JSON=` en el `.env`

### Paso 6: Configurar GOOGLE_CALENDAR_ID
1. Volvé a Google Calendar → Settings & sharing → calendario del estudio
2. En la sección **Integrate calendar** → copiá el valor de **Calendar ID**
   - Usar tu dirección de Gmail si es el principal: `estudioescobaryasociados.bot@gmail.com`
3. Pegalo en el `.env`:
   ```
   GOOGLE_CALENDAR_ID=estudioescobaryasociados.bot@gmail.com
   ```

### Paso 7: Probar
```bash
node test-flujo-turno.js
```
- Revisá que en la tabla `turnos` de Supabase, la columna `google_event_id` ya no sea NULL.
- Revisá tu Google Calendar: aparece el evento "⚖️ Turno - Carlos Fernández" con fecha 28 de septiembre 11:30hs y link de Meet generado automáticamente.

---

## ✅ Estado actual del proyecto (Features implementadas)

| Estado | Feature |
|--------|---------|
| ✅ HECHO | Servidor Express + CORS base + health check |
| ✅ HECHO | Webhook Meta (GET/POST) con desafío y recepción de mensajes |
| ✅ HECHO | Envío de mensajes por WhatsApp Cloud API (whatsapp.service.js) |
| ✅ HECHO | Máquina de estados por usuario: MENU → ESPERANDO_NOMBRE → ESPERANDO_MOTIVO → ESPERANDO_FECHA_HORA |
| ✅ HECHO | Comando global "menu" o "0" para volver al inicio en cualquier paso |
| ✅ HECHO | Validaciones: nombre ≥2 chars, motivo ≥5 chars |
| ✅ HECHO | Persistencia en Supabase: cliente creado/obtenido por teléfono + turno asociado |
| ✅ HECHO | Mensaje de confirmación con resumen al finalizar el alta |
| ✅ HECHO | Estructura 3 tablas en Supabase (clientes / turnos / pagos) con FK e índices |
| ✅ HECHO | Services: clienteService, turnoService, pagoService (CRUD completo) |
| ✅ HECHO | Script de prueba local end-to-end: `test-flujo-turno.js` |
| ✅ HECHO | Notificaciones por mail con Resend: categoría automática por keywords, badge color, link wa.me directo |
| ✅ HECHO | Manejo tolerante a fallos: si falla mail o Google Calendar no se rompe la experiencia para el cliente |
| ✅ HECHO | **Paso de fecha y horario**: parseador inteligente de texto libre ("Lunes 30/09 10hs", "mañana tarde", "Viernes 11am", etc.) con timezone Argentina. |
| ✅ HECHO | **Google Calendar Service Account**: creación automática de evento "⚖️ Turno - Nombre" + Google Meet + recordatorios 24hs/1hs antes. |
| ✅ HECHO | **Campos Supabase**: `fecha_turno` (ISO timestamp) + `google_event_id` se guardan en la tabla `turnos`. |
| ✅ HECHO | **Manejo de mensajes multimedia**: Detección de audios/imágenes y respuesta pidiendo texto. |
| ✅ HECHO | **UX Avanzada**: Timeout de inactividad (24h) y aviso dinámico de "Fuera de horario comercial". |
| ✅ HECHO | **Flujo de cancelación**: Submenú de turnos + alerta inmediata por email al estudio. |

---

## 🚧 Roadmap - Próximos pasos (PENDIENTES)

| Prioridad | Tarea |
|-----------|-------|
| 🔴 ALTA  | Configurar credenciales reales de Meta WhatsApp + tunel HTTPS (ngrok/cloudflared) → probar con WhatsApp real |
| 🔴 ALTA  | Implementar "Mensajes Proactivos" (Notificaciones HSM/Templates): Cron job que lea Supabase y envíe recordatorio 24hs antes del turno. |
| 🟡 MEDIA | Integrar Mercado Pago: generar link de seña al confirmar turno → guardar `mp_pago_id` y `monto` en tabla `pagos` |
| 🟡 MEDIA | Verificar dominio en Resend → cambiar `RESEND_FROM_EMAIL` de `onboarding@resend.dev` a `noreply@estudioescobaryasociados.com` |
| 🟡 MEDIA | Enviar mail al cliente también (no solo al estudio) con confirmación de turno + link GCAL |
| 🟢 BAJA  | Persistir estados de conversación en Redis / Supabase (para no perder si se reinicia el servidor) |
| 🟢 BAJA  | Detección de lenguaje natural más flexible (no solo match exacto) |
| 🟢 BAJA  | Panel web para el estudio (Next.js + Tailwind) para ver turnos pendientes, confirmar, cancelar |

---

## 📝 Changelog de avances

> **Registro de modificaciones importantes - actualizar después de cada avance**

### 2026-09-26 - Etapa 4: UX, Manejo de Errores y Cancelación
- ✅ **Manejo de mensajes multimedia**: El bot detecta cuando el usuario envía un audio, imagen, sticker o documento (`message.type !== 'text'`), ignora el procesamiento normal y responde automáticamente avisando que por ahora solo comprende mensajes de texto.
- ✅ **Timeout de inactividad de 24hs**: Se mejoró el gestor de estados en memoria (`conversationState.service.js`). Ahora cada interacción actualiza un timestamp `lastUpdated`. Si un usuario abandona la conversación a la mitad y vuelve a escribir después de 24 horas, el sistema reinicia automáticamente su sesión al menú principal para evitar que quede "trabado" en pasos antiguos.
- ✅ **Manejo de Horarios Comerciales**: Se implementó una función `esFueraDeHorario()` que detecta (usando la zona horaria `America/Buenos_Aires`) si es fin de semana o si son horas fuera de la franja 09:00 - 18:00hs. Si el usuario inicia chat en esos horarios, el bot añade *solo en el mensaje inicial de bienvenida* un aviso recordando el horario de atención humana.
- ✅ **Flujo de Cancelación de Turnos**: 
  - La Opción 2 del Menú Principal ahora es un Submenú ("Gestión de Turnos") con dos opciones: A) Agendar nuevo, B) Cancelar existente.
  - Al elegir cancelar, el bot solicita el nombre completo.
  - Se agregó la función `sendCancellationEmail()` en `email.service.js` que dispara una alerta por correo electrónico al Estudio Jurídico con un recuadro rojo avisando de la solicitud de cancelación, para que los asesores liberen la agenda manualmente.

### 2026-09-24 - Etapa 3: Selección de Turno + Google Calendar
- ✅ Nuevo estado `ESPERANDO_FECHA_HORA` agregado a la máquina (4 estados en total)
- ✅ Servicio `calendar.service.js`:
  - Autenticación por Service Account (sin OAuth) con carga de credenciales por `.env` o archivo `google-service-account.json` fallback
  - `parseFechaYHora()` parseador inteligente de texto libre en AR: días de semana, fechas 30/09, "30 de septiembre", "mañana", "pasado mañana", "mañana 14:00", "Viernes 11am", "tarde", etc.
  - `createCalendarEvent()` crea evento "⚖️ Turno - Nombre" con Google Meet automático, recordatorios email 24hs antes y popup 1hs antes. Timezone America/Argentina/Buenos_Aires.
- ✅ Integración en `bot.controller.js`:
  - Paso 5 de fecha/hora con ejemplos sugeridos al usuario
  - Flujo tolerante a fallos: si falla GCAL el turno igual se guarda y se envía el mail
  - Campo `google_event_id` se persiste en tabla turnos mediante `actualizarFechaTurno()`
  - Resumen de confirmación para el usuario muestra fecha humana + links a GCAL y Meet cuando están disponibles
- ✅ Actualización `email.service.js`:
  - Nueva fila "Franja elegida por cliente" en card del turno
  - Botón azul "📅 Abrir evento en Google Calendar" solo si existe gcalLink
  - Botón verde "💻 Unirse directamente a Meet" solo si existe hangoutLink
  - `_fechaHumano`, `_gcalLink`, `_gcalMeetLink` inyectados desde controlador
- ✅ Variables `.env` nuevas: `GOOGLE_CALENDAR_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON`
- ✅ Tutorial detallado de setup Google Cloud → Service Account → compartir calendario → configurar credenciales
- ✅ Prueba end-to-end OK: cliente Carlos Fernández / turno 28/9 11:30hs guardado correctamente, categorizado como Derecho Laboral, mail enviado a estudioescobaryasociados.bot@gmail.com (Resend ID 01a0d583-c1c8-7598-a2d1-a05d7e992c62)

### 2026-09-24 - Etapa 2: Notificaciones por Mail + Resend
- ✅ Servicio `email.service.js` con librería Resend + HTML premium (paleta oscura + acento verde neón, badge de estado, link wa.me directo, link categorías)
- ✅ Variables nuevas en `.env`: `RESEND_API_KEY`, `RESEND_FROM_NAME`, `RESEND_FROM_EMAIL`, `STUDIO_EMAIL`
- ✅ Integración en `bot.controller.js`: luego de registrar turno, se llama a `sendNewCaseEmail(cliente, turno)` en try/catch separado (no bloquea al usuario si falla)
- ✅ Actualización de `test-flujo-turno.js`: loguea ID del mail de Resend y muestra dónde revisarlo
- ✅ Solución rápida de "dominio sin verificar": usando `onboarding@resend.dev` como remitente de prueba
- ✅ Prueba real OK: correo enviado a estudioescobaryasociados.bot@gmail.com

### 2026-09-24 - Etapa 1: Persistencia real completada
- ✅ Schema SQL 3 tablas: clientes, turnos, pagos + índices + RLS
- ✅ ALTER TABLE: fecha_turno DROP NOT NULL, cliente_id SET NOT NULL, nombre_completo SET NOT NULL
- ✅ Services creados: clienteService.js, turnoService.js, pagoService.js, conversationState.service.js
- ✅ Máquina de estados 3 pasos + comando global MENU
- ✅ Guarda cliente y turno al finalizar flujo de solicitud
- ✅ Script test-flujo-turno.js para prueba end-to-end sin WhatsApp
- ✅ Probado con Supabase real (proyecto: gxnyxderovumzbxegcii) - registro Juan Pérez insertado OK

---

## 👀 Ayuda rápida / Troubleshooting

| Error | Solución |
|-------|----------|
| `TypeError: fetch failed` al guardar en Supabase | Chequeá que `SUPABASE_URL` no tenga `/rest/v1/` al final. |
| Turnos no se guardan por NOT NULL en fecha_turno | Ejecutá el ALTER TABLE de la sección "Primeros ALTER obligatorios". |
| Meta no llega al webhook | Asegurate de que el túnel (ngrok/cloudflared) esté encendido y la URL en Meta termine en `/webhook`. |
| Responde 403 al GET /webhook | `WHATSAPP_VERIFY_TOKEN` no coincide con lo cargado en Meta. |
| **Resend 403 "domain is not verified"** | Si usas un dominio propio como `noreply@estudioescobaryasociados.com` tenés que verificarlo en https://resend.com/domains. Para probar rápido, usa `RESEND_FROM_EMAIL=onboarding@resend.dev` en el `.env`. |
| Mail no llega en Entrada → mirá SPAM | Los correos de `onboarding@resend.dev` a veces caen en Promociones o Spam la primera vez. Markéalos como "No es spam" y después pasan a Entrada. |
| `No se encontraron credenciales de Google Calendar.` | Definí `GOOGLE_SERVICE_ACCOUNT_JSON=` en el `.env` con el JSON completo descargado desde Google Cloud, o creá el archivo `google-service-account.json` en la raíz. |
| GCAL 403 Forbidden "The caller does not have permission" | Te olvidaste de **compartir tu calendario con el client_email del Service Account** con permisos de Editor. Revisá el paso 4 del tutorial. |
| `Invalid_grant` / `JWT` error con Google Calendar | El JSON del Service Account está mal copiado. Verificá que la `private_key` contenga los `\n` correctos y que `client_email` sea el mismo. |
| El evento aparece pero sin link a Meet | Asegurate de que no haya una política de Google Workspace que bloquee Meet. Revisá los logs del server y el error. |
| Fecha de turno sale mal en Supabase | Recordá que todas las fechas en Postgres se guardan en UTC, pero el bot usa `toLocaleString('es-AR')` al mostrarlas al cliente. Si la diferencia es 3hs → todo OK. |

---

***

*Actualizado por última vez: 2026-09-24*

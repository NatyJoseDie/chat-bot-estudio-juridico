/**
 * ============================================================
 * SCRIPT DE PRUEBA RÁPIDA: Flujo completo turno + Mail + Google Calendar
 * ============================================================
 * Ejecutar con:  node test-flujo-turno.js
 *
 * Flujo:
 *   1) Saludo inicial -> menú
 *   2) Opción 2 (turno) -> ESPERANDO_NOMBRE
 *   3) Nombre -> ESPERANDO_MOTIVO
 *   4) Motivo -> ESPERANDO_FECHA_HORA
 *   5) Fecha/hora -> Guardar cliente + turno + evento GCAL + envía mail
 *
 * Después del script, revisá:
 *   - Supabase:  public.clientes / turnos  (fecha_turno y google_event_id)
 *   - Gmail:     estudioescobaryasociados.bot@gmail.com  (verás link a GCAL)
 *   - Resend:    https://resend.com/dashboard/emails
 *   - G. Calend: (si configuraste las credenciales) verás el evento creado
 * ============================================================
 */

import { processUserMessage } from './src/controllers/bot.controller.js';
import { buscarClientePorTelefono } from './src/services/clienteService.js';
import { obtenerTurnosPorCliente } from './src/services/turnoService.js';

const TELEFONO_PRUEBA = '5491199990005';

const separador = () => console.log('\n' + '='.repeat(70) + '\n');

async function simularMensaje(textoUsuario) {
  console.log(`👤 USUARIO (${TELEFONO_PRUEBA}): "${textoUsuario}"`);
  const respuesta = await processUserMessage(TELEFONO_PRUEBA, textoUsuario);
  console.log(`🤖 BOT:\n${respuesta}\n`);
  return respuesta;
}

async function main() {
  try {
    console.log('🚀 INICIANDO PRUEBA COMPLETA (Turno + Mail + Google Calendar)\n');

    // Paso 1
    separador();
    console.log('👉 PASO 1: El usuario saluda (menú principal)');
    await simularMensaje('Hola');

    // Paso 2
    separador();
    console.log('👉 PASO 2: El usuario elige opción de turno');
    await simularMensaje('turno');

    // Paso 3
    separador();
    console.log('👉 PASO 3: El usuario envía su nombre');
    await simularMensaje('Carlos Fernández');

    // Paso 4
    separador();
    console.log('👉 PASO 4: El usuario envía el motivo');
    await simularMensaje('Despido sin indemnización, trabajo como empleado administrativo hace 3 años.');

    // Paso 5 (NUEVO!)
    separador();
    console.log('👉 PASO 5: El usuario envía FECHA y HORARIO (se guarda fecha_turno, crea evento GCAL, envía mail)');
    await simularMensaje('Lunes 6 de octubre a las 11:30 hs');

    // Paso 6 - Verificación
    separador();
    console.log('🔍 VERIFICANDO DATOS GUARDADOS EN SUPABASE...\n');

    const cliente = await buscarClientePorTelefono(TELEFONO_PRUEBA);
    if (!cliente) {
      console.error('❌ ERROR: No se encontró el cliente en Supabase 😞');
      process.exit(1);
    }
    console.log('✅ CLIENTE GUARDADO EN TABLA `clientes`:');
    console.log('   id              :', cliente.id);
    console.log('   telefono        :', cliente.telefono);
    console.log('   nombre_completo :', cliente.nombre_completo);
    console.log('   creado_en       :', cliente.creado_en);

    const turnos = await obtenerTurnosPorCliente(cliente.id);
    if (!turnos || turnos.length === 0) {
      console.error('\n❌ ERROR: No se encontró ningún turno para este cliente 😞');
      process.exit(1);
    }
    const ultimoTurno = turnos[0];
    console.log('\n✅ TURNO GUARDADO EN TABLA `turnos`:');
    console.log('   id              :', ultimoTurno.id);
    console.log('   cliente_id      :', ultimoTurno.cliente_id);
    console.log('   resumen_caso    :', ultimoTurno.resumen_caso);
    console.log('   estado          :', ultimoTurno.estado);
    console.log('   fecha_turno     :',
      ultimoTurno.fecha_turno
        ? new Date(ultimoTurno.fecha_turno).toLocaleString('es-AR')
        : 'NULL (nunca se debería ver este NULL!)'
    );
    console.log('   google_event_id :', ultimoTurno.google_event_id ??
      'NULL (no se configuró Service Account - leer tutorial README)');
    console.log('   creado_en       :', ultimoTurno.creado_en);

    separador();
    console.log('🎉 ¡PRUEBA EXITOSA!');
    console.log('');
    console.log('📋 Qué revisar:');
    console.log('   1) Supabase: client.id coincide con turno.cliente_id ✔️');
    console.log('   2) Supabase: fecha_turno NO ES NULL (almacenado como ISO timestamp) ✔️');
    console.log('   3) Gmail ->', process.env.STUDIO_EMAIL, '(Busca asunto "[Derecho Laboral] Nuevo Turno - Carlos Fernández")');
    console.log('   4) Dentro del mail: verás 2 botones nuevos: "Abrir evento en Google Calendar" y "Unirse a Meet"');
    console.log('   5) Google Calendar: si credenciales están configuradas verás el evento "⚖️ Turno - Carlos Fernández"');

  } catch (error) {
    console.error('\n❌ ERROR DURANTE LA PRUEBA:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();

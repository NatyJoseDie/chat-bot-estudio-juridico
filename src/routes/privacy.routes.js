import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.status(200).type('html').send(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Política de Privacidad — Estudio Escobar y Asociados</title>
    <style>
      body { margin: 0; background: #f5f7fb; color: #1f2937; font-family: Arial, sans-serif; line-height: 1.6; }
      main { max-width: 760px; margin: 48px auto; padding: 40px; background: #fff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 23, 42, .08); }
      h1 { color: #172554; line-height: 1.25; }
      h2 { color: #1e3a8a; margin-top: 28px; }
      footer { margin-top: 32px; color: #4b5563; font-size: .9rem; }
      @media (max-width: 640px) { main { margin: 16px; padding: 24px; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Política de Privacidad — Estudio Escobar y Asociados</h1>
      <p>Estudio Escobar y Asociados protege la privacidad de las personas que se comunican con el estudio mediante WhatsApp y otros canales oficiales.</p>

      <h2>Información que podemos recopilar</h2>
      <p>Podemos recopilar los datos que una persona proporcione voluntariamente al realizar una consulta, tales como nombre, número de teléfono, información de contacto, el contenido de los mensajes y datos relacionados con la solicitud de atención.</p>

      <h2>Uso de la información</h2>
      <p>La información se utiliza exclusivamente para atender y gestionar consultas, organizar solicitudes de atención, coordinar comunicaciones y contactar a la persona usuaria respecto de su consulta.</p>

      <h2>Almacenamiento y protección</h2>
      <p>Los datos pueden almacenarse de forma segura en sistemas utilizados por el estudio para la gestión de consultas y solicitudes de atención. Se adoptan medidas razonables para proteger la información frente a accesos no autorizados.</p>

      <h2>Datos personales</h2>
      <p>Estudio Escobar y Asociados no vende datos personales. La información no se utiliza con fines ajenos a la atención y gestión de consultas del estudio, salvo que exista una obligación legal aplicable.</p>

      <h2>Consultas sobre privacidad</h2>
      <p>Para realizar consultas relacionadas con esta política o con el tratamiento de datos personales, podés comunicarte por los canales de contacto oficiales de Estudio Escobar y Asociados.</p>

      <footer>Última actualización: septiembre de 2026.</footer>
    </main>
  </body>
</html>`);
});

export default router;

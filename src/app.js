import express from 'express';
import healthRouter from './routes/health.routes.js';
import privacyRouter from './routes/privacy.routes.js';
import webhookRouter from './routes/webhook.routes.js';

const app = express();

// Middlewares obligatorios para Express y Meta Webhooks// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// LOG GLOBAL PARA INTERCEPTAR TODO
app.use((req, res, next) => {
    console.log(`\n======================================`);
    console.log(`[GLOBAL LOG] PETICIÓN ENTRANTE`);
    console.log(`Método: ${req.method}`);
    console.log(`URL: ${req.originalUrl}`);
    console.log(`Headers:`, JSON.stringify(req.headers, null, 2));
    if (req.method === 'POST') {
        console.log(`Body:`, JSON.stringify(req.body, null, 2));
    }
    console.log(`======================================\n`);
    next();
});

// Rutasapp.use('/api', healthRouter);
app.use('/privacy', privacyRouter);
app.use('/webhook', webhookRouter);

// Manejador global de 404 (SIEMPRE al final)
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

export default app;

import express from 'express';
import healthRouter from './routes/health.routes.js';
import privacyRouter from './routes/privacy.routes.js';
import webhookRouter from './routes/webhook.routes.js';

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use('/api', healthRouter);
app.use('/privacy', privacyRouter);
app.use('/webhook', webhookRouter);

// Manejador global de 404 (SIEMPRE al final)
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

export default app;

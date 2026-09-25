import { Router } from 'express';

const router = Router();

/**
 * GET /api/health
 * Endpoint de verificación de estado del servidor.
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    servicio: 'chat-bot-estudio-juridico',
  });
});

export default router;

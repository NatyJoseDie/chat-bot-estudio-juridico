import 'dotenv/config';
import app from './src/app.js';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});

// Manejo explícito de errores para evitar cierres silenciosos
server.on('error', (error) => {
  console.error('❌ Error en el servidor:', error);
});

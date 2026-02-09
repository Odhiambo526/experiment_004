// Token Identity Verification API
// Main entry point for the Fastify server

import 'dotenv/config';
import { buildApp } from './app.js';
import { logger } from './lib/logger.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info(`Server running at http://${HOST}:${PORT}`);
    logger.info(`API docs available at http://${HOST}:${PORT}/docs`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

main();

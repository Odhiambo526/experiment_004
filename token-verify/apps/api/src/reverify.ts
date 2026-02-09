#!/usr/bin/env node
// Token Identity Verification - Re-verification CLI
// Run with: npm run reverify
// Can be scheduled via cron or triggered manually

import 'dotenv/config';
import { runReverificationCron } from './jobs/reverification.js';
import { logger } from './lib/logger.js';

async function main() {
  logger.info('Starting re-verification job');
  
  try {
    await runReverificationCron();
    logger.info('Re-verification job completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Re-verification job failed');
    process.exit(1);
  }
}

main();

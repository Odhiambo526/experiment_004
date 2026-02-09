// Token Identity Verification - Logger Configuration
// Pino logger for standalone logging (not Fastify integration)
// Note: Fastify uses its own pino instance configured in app.ts

import { pino, type Logger, type LoggerOptions } from 'pino';

const isDev = process.env.NODE_ENV === 'development';

const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  base: {
    service: 'token-verify-api',
    version: process.env.npm_package_version || '1.0.0',
  },
};

export const logger: Logger = pino(loggerOptions);

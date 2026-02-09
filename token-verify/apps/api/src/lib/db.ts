// Token Identity Verification - Database Client
// Prisma client instance for API

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __db: PrismaClient | undefined;
}

// Singleton pattern to prevent multiple connections in development
export const db =
  global.__db ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__db = db;
}

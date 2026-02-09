// Token Identity Verification - Audit Logging Service
// Immutable logging of all system actions for transparency

import { AuditActor, type Prisma } from '@prisma/client';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

/**
 * Log an audit event
 * 
 * All state changes are logged for transparency and debugging.
 * These logs are never deleted (except for GDPR user deletion requests).
 */
export async function logAuditEvent(params: {
  actor: AuditActor;
  actorId?: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const {
    actor,
    actorId,
    action,
    targetType,
    targetId,
    metadata = {},
    ipAddress,
    userAgent,
  } = params;

  try {
    await db.auditLog.create({
      data: {
        actor,
        actorId,
        action,
        targetType,
        targetId,
        metadata: metadata as Prisma.InputJsonValue,
        ipAddress,
        userAgent,
      },
    });

    logger.debug(
      { actor, action, targetType, targetId },
      'Audit event logged'
    );
  } catch (error) {
    // Never fail a request because of audit logging
    logger.error({ error, params }, 'Failed to log audit event');
  }
}

/**
 * Get audit logs for a specific target
 */
export async function getAuditLogs(params: {
  targetType: string;
  targetId: string;
  limit?: number;
  offset?: number;
}): Promise<{
  logs: Array<{
    id: string;
    actor: AuditActor;
    actorId: string | null;
    action: string;
    metadata: unknown;
    createdAt: Date;
  }>;
  total: number;
}> {
  const { targetType, targetId, limit = 50, offset = 0 } = params;

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        actor: true,
        actorId: true,
        action: true,
        metadata: true,
        createdAt: true,
      },
    }),
    db.auditLog.count({ where: { targetType, targetId } }),
  ]);

  return { logs, total };
}

/**
 * Get audit logs by action type
 */
export async function getAuditLogsByAction(params: {
  action: string;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
}): Promise<{
  logs: Array<{
    id: string;
    actor: AuditActor;
    actorId: string | null;
    targetType: string;
    targetId: string;
    metadata: unknown;
    createdAt: Date;
  }>;
  total: number;
}> {
  const { action, limit = 50, offset = 0, startDate, endDate } = params;

  const where: {
    action: string;
    createdAt?: { gte?: Date; lte?: Date };
  } = { action };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        actor: true,
        actorId: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
      },
    }),
    db.auditLog.count({ where }),
  ]);

  return { logs, total };
}

/**
 * Helper to extract request context for audit logging
 */
export function extractRequestContext(request: {
  ip?: string;
  headers?: { 'user-agent'?: string };
}): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: request.ip,
    userAgent: request.headers?.['user-agent'],
  };
}

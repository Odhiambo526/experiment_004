// Token Identity Verification - Error Handler
// Centralized error handling for consistent API responses
// Response format: { success: false, error: { code, message, details? }, meta? }

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { ERROR_CODES } from '@token-verify/shared';
import { logger } from './logger.js';

/**
 * Standardized error response shape
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }> | Record<string, unknown>;
  };
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Array<{ field: string; message: string }> | Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Create common API errors
 */
export const Errors = {
  notFound: (resource: string) =>
    new ApiError(404, ERROR_CODES.NOT_FOUND, `${resource} not found`),

  badRequest: (message: string, details?: Array<{ field: string; message: string }> | Record<string, unknown>) =>
    new ApiError(400, ERROR_CODES.INVALID_INPUT, message, details),

  validation: (errors: Array<{ field: string; message: string }>) =>
    new ApiError(422, ERROR_CODES.INVALID_INPUT, 'Validation failed', errors),

  unauthorized: (message = 'Unauthorized') =>
    new ApiError(401, ERROR_CODES.UNAUTHORIZED, message),

  forbidden: (message = 'Forbidden') =>
    new ApiError(403, ERROR_CODES.FORBIDDEN, message),

  conflict: (message: string) =>
    new ApiError(409, ERROR_CODES.ALREADY_EXISTS, message),

  tooManyRequests: (message = 'Too many requests') =>
    new ApiError(429, 'RATE_LIMITED', message),

  internalError: (message = 'Internal server error') =>
    new ApiError(500, ERROR_CODES.INTERNAL_ERROR, message),

  externalServiceError: (service: string, details?: Record<string, unknown>) =>
    new ApiError(
      502,
      ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      `External service error: ${service}`,
      details
    ),

  serviceUnavailable: (message = 'Service temporarily unavailable') =>
    new ApiError(503, 'SERVICE_UNAVAILABLE', message),
};

/**
 * Convert Zod errors to standardized field errors
 */
function zodToFieldErrors(zodError: ZodError): Array<{ field: string; message: string }> {
  return zodError.errors.map((e) => ({
    field: e.path.join('.') || 'root',
    message: e.message,
  }));
}

/**
 * Convert Fastify validation errors to standardized field errors
 */
function fastifyValidationToFieldErrors(
  validation: FastifyError['validation']
): Array<{ field: string; message: string }> {
  if (!validation) return [];
  return validation.map((v) => ({
    field: String(v.instancePath?.replace(/^\//, '').replace(/\//g, '.') || v.params?.missingProperty || 'unknown'),
    message: v.message || 'Validation error',
  }));
}

/**
 * Build error response object
 */
function buildErrorResponse(
  code: string,
  message: string,
  details?: Array<{ field: string; message: string }> | Record<string, unknown>,
  requestId?: string
): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    error: { code, message },
  };

  if (details) {
    response.error.details = details;
  }

  if (requestId) {
    response.meta = {
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  return response;
}

/**
 * Check if an error is a ZodError (handles ESM module boundary issues)
 */
function isZodError(error: unknown): error is ZodError {
  if (error instanceof ZodError) return true;
  // Fallback check for ESM module boundary issues
  return (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    error.name === 'ZodError' &&
    'issues' in error &&
    Array.isArray((error as ZodError).issues)
  );
}

/**
 * Global error handler for Fastify
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = String(request.id);

  // Handle Zod validation errors
  if (isZodError(error)) {
    const fieldErrors = zodToFieldErrors(error as ZodError);
    return reply.status(422).send(
      buildErrorResponse(
        ERROR_CODES.INVALID_INPUT,
        'Validation failed',
        fieldErrors,
        requestId
      )
    );
  }

  // Handle custom API errors
  if (error instanceof ApiError) {
    return reply.status(error.statusCode).send(
      buildErrorResponse(
        error.code,
        error.message,
        error.details,
        requestId
      )
    );
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    const fieldErrors = fastifyValidationToFieldErrors(error.validation);
    return reply.status(400).send(
      buildErrorResponse(
        ERROR_CODES.INVALID_INPUT,
        'Request validation failed',
        fieldErrors,
        requestId
      )
    );
  }

  // Handle Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as Error & { code?: string };
    
    // Handle unique constraint violations
    if (prismaError.code === 'P2002') {
      return reply.status(409).send(
        buildErrorResponse(
          ERROR_CODES.ALREADY_EXISTS,
          'Resource already exists',
          undefined,
          requestId
        )
      );
    }
    
    // Handle foreign key constraint violations
    if (prismaError.code === 'P2003') {
      return reply.status(400).send(
        buildErrorResponse(
          ERROR_CODES.INVALID_INPUT,
          'Referenced resource does not exist',
          undefined,
          requestId
        )
      );
    }

    // Handle record not found
    if (prismaError.code === 'P2025') {
      return reply.status(404).send(
        buildErrorResponse(
          ERROR_CODES.NOT_FOUND,
          'Resource not found',
          undefined,
          requestId
        )
      );
    }
  }

  // Log unexpected errors (don't expose internal details)
  logger.error(
    {
      err: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      requestId,
      url: request.url,
      method: request.method,
    },
    'Unhandled error'
  );

  // Generic error response - never expose internal details in production
  const isDev = process.env.NODE_ENV === 'development';
  return reply.status(500).send(
    buildErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      isDev ? error.message : 'An unexpected error occurred',
      isDev ? { stack: error.stack?.split('\n').slice(0, 5) } : undefined,
      requestId
    )
  );
}

import type { FastifyError, FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError, ErrorCode } from './AppError';
import { createLogger } from '../logger/index';
import { ZodError } from 'zod';

const log = createLogger('error-handler');

// ── Fastify Global Error Handler ──────────────────────────────────────────────

export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler(
    async (error: FastifyError | AppError | Error | ZodError, request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request.id as string) || 'unknown';

      // ── Zod Validation Error ───────────────────────────────────────────────
      if (error instanceof ZodError) {
        log.warn({ requestId, errors: error.errors }, 'Zod validation error');
        return reply.status(400).send({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            requestId,
            details: error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
      }

      // ── Operational Application Error ──────────────────────────────────────
      if (error instanceof AppError) {
        const level = error.statusCode >= 500 ? 'error' : 'warn';
        log[level](
          { requestId, code: error.code, statusCode: error.statusCode },
          error.message,
        );
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
            requestId,
            ...(error.details ? { details: error.details } : {}),
          },
        });
      }

      // ── Fastify Validation Error (JSON Schema) ─────────────────────────────
      if ((error as FastifyError).validation) {
        const fastifyError = error as FastifyError;
        log.warn({ requestId, validation: fastifyError.validation }, 'Request validation error');
        return reply.status(400).send({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Request validation failed',
            requestId,
            details: fastifyError.validation,
          },
        });
      }

      // ── Fastify HTTP Errors ────────────────────────────────────────────────
      if ('statusCode' in error && typeof (error as FastifyError).statusCode === 'number') {
        const httpError = error as FastifyError;
        const code =
          httpError.statusCode === 401 ? ErrorCode.UNAUTHORIZED
          : httpError.statusCode === 403 ? ErrorCode.FORBIDDEN
          : httpError.statusCode === 404 ? ErrorCode.NOT_FOUND
          : httpError.statusCode === 429 ? 'RATE_LIMIT_EXCEEDED'
          : ErrorCode.BAD_REQUEST;

        log.warn({ requestId, statusCode: httpError.statusCode }, httpError.message);
        return reply.status(httpError.statusCode ?? 400).send({
          error: {
            code,
            message: httpError.message,
            requestId,
          },
        });
      }

      // ── Unknown / Unhandled Error ──────────────────────────────────────────
      log.error(
        { requestId, err: error, stack: error.stack },
        'Unhandled server error',
      );

      return reply.status(500).send({
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred',
          requestId,
        },
      });
    },
  );

  // ── Not Found Handler ──────────────────────────────────────────────────────
  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    log.warn({ url: request.url, method: request.method }, '404 Not Found');
    return reply.status(404).send({
      error: {
        code: ErrorCode.NOT_FOUND,
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id as string,
      },
    });
  });
}

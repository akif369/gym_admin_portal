import type { FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from '../config/env';

export async function registerRateLimit(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    cache: 10000,
    allowList: config.isDevelopment ? ['127.0.0.1', '::1'] : [],
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        retryAfter: Math.ceil(context.ttl / 1000),
      },
    }),
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise IP
      const user = (request as any).user;
      return user?.userId ?? request.ip;
    },
  });
}

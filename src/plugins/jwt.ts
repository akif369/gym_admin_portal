import type { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import * as jwt from 'jsonwebtoken';
import { config } from '../config/env';

export async function registerJwt(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyJwt, {
    secret: config.jwt.accessSecret,
    sign: {
      expiresIn: config.jwt.accessExpiresIn,
      algorithm: 'HS256',
    },
    verify: {
      algorithms: ['HS256'],
    },
  });
}

// ── Refresh token JWT (separate secret, using jsonwebtoken directly) ───────────

export function signRefreshToken(
  _fastify: FastifyInstance,
  payload: { userId: string; sessionId: string },
): string {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as any,
    algorithm: 'HS256',
  });
}

export function verifyRefreshToken(
  _fastify: FastifyInstance,
  token: string,
): { userId: string; sessionId: string } {
  return jwt.verify(token, config.jwt.refreshSecret, {
    algorithms: ['HS256'],
  }) as { userId: string; sessionId: string };
}

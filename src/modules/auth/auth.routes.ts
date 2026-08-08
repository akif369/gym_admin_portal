import type { FastifyInstance } from 'fastify';
import { authController } from './auth.controller';
import { requireAuth } from '../../common/auth/requireAuth';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Public endpoints (no auth required) ──────────────────────────────────
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Auth'],
      summary: 'Login with email and password',
      security: [],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, authController.login);

  fastify.post('/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Rotate refresh token and get new access token',
      security: [],
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
  }, authController.refresh);

  fastify.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Auth'],
      summary: 'Request password reset email',
      security: [],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, authController.forgotPassword);

  fastify.post('/reset-password', {
    schema: {
      tags: ['Auth'],
      summary: 'Complete password reset using token',
      security: [],
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 },
        },
      },
    },
  }, authController.resetPassword);

  // ── Authenticated endpoints ───────────────────────────────────────────────
  fastify.get('/me', {
    preHandler: [requireAuth],
    schema: { tags: ['Auth'], summary: 'Get current user profile and permissions' },
  }, authController.me);

  fastify.post('/logout', {
    preHandler: [requireAuth],
    schema: { tags: ['Auth'], summary: 'Revoke current session' },
  }, authController.logout);

  fastify.post('/logout-all', {
    preHandler: [requireAuth],
    schema: { tags: ['Auth'], summary: 'Revoke all active sessions' },
  }, authController.logoutAll);

  fastify.post('/change-password', {
    preHandler: [requireAuth],
    schema: {
      tags: ['Auth'],
      summary: 'Change password while authenticated',
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 },
        },
      },
    },
  }, authController.changePassword);

  fastify.get('/sessions', {
    preHandler: [requireAuth],
    schema: { tags: ['Auth'], summary: 'List all active sessions' },
  }, authController.sessions);

  fastify.delete('/sessions/:sessionId', {
    preHandler: [requireAuth],
    schema: {
      tags: ['Auth'],
      summary: 'Revoke a specific session',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: { sessionId: { type: 'string', format: 'uuid' } },
      },
    },
  }, authController.revokeSession);
}

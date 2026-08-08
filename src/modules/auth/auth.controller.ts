import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  loginService,
  refreshTokenService,
  logoutService,
  logoutAllService,
  getMeService,
  getSessionsService,
  revokeSessionService,
  forgotPasswordService,
  resetPasswordService,
  changePasswordService,
} from './auth.service';
import {
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from './auth.schema';

export const authController = {
  async login(request: FastifyRequest, reply: FastifyReply) {
    const body = loginSchema.parse(request.body);
    const result = await loginService(request.server, body.email, body.password, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.status(200).send(result);
  },

  async refresh(request: FastifyRequest, reply: FastifyReply) {
    const body = refreshTokenSchema.parse(request.body);
    const result = await refreshTokenService(request.server, body.refreshToken, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.status(200).send(result);
  },

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const { userId, sessionId, orgId } = request.user;
    await logoutService(sessionId, userId, orgId, request.ip);
    return reply.status(200).send({ message: 'Logged out successfully' });
  },

  async logoutAll(request: FastifyRequest, reply: FastifyReply) {
    const { userId, orgId } = request.user;
    await logoutAllService(userId, orgId, request.ip);
    return reply.status(200).send({ message: 'All sessions revoked' });
  },

  async me(request: FastifyRequest, reply: FastifyReply) {
    const user = await getMeService(request.user.userId);
    return reply.status(200).send({ user });
  },

  async sessions(request: FastifyRequest, reply: FastifyReply) {
    const sessions = await getSessionsService(request.user.userId);
    return reply.status(200).send({ sessions });
  },

  async revokeSession(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
    await revokeSessionService(request.params.sessionId, request.user.userId);
    return reply.status(200).send({ message: 'Session revoked' });
  },

  async forgotPassword(request: FastifyRequest, reply: FastifyReply) {
    const body = forgotPasswordSchema.parse(request.body);
    const result = await forgotPasswordService(body.email, '', request.ip);
    return reply.status(200).send(result);
  },

  async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    const body = resetPasswordSchema.parse(request.body);
    await resetPasswordService(body.token, body.newPassword, request.ip);
    return reply.status(200).send({ message: 'Password reset successfully' });
  },

  async changePassword(request: FastifyRequest, reply: FastifyReply) {
    const body = changePasswordSchema.parse(request.body);
    await changePasswordService(
      request.user.userId,
      request.user.orgId,
      body.currentPassword,
      body.newPassword,
      request.ip,
    );
    return reply.status(200).send({ message: 'Password changed successfully' });
  },
};

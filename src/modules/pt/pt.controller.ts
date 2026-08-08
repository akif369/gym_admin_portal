import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  listPackagesService, createPackageService, updatePackageService,
  listSessionsService, getTodaySessionsService, bookSessionService, getSessionService,
  updateSessionService, completeSessionService, cancelSessionService, missSessionService,
} from './pt.service';

export const ptController = {
  async listPackages(req: FastifyRequest, reply: FastifyReply) { return reply.send({ packages: await listPackagesService(req.user.orgId) }); },
  async createPackage(req: FastifyRequest, reply: FastifyReply) { return reply.status(201).send({ package: await createPackageService(req.user.orgId, req.body) }); },
  async updatePackage(req: FastifyRequest<{ Params: { packageId: string } }>, reply: FastifyReply) { return reply.send({ package: await updatePackageService(req.user.orgId, req.params.packageId, req.body) }); },
  async listSessions(req: FastifyRequest, reply: FastifyReply) { return reply.send(await listSessionsService(req.user.orgId, req.query as any)); },
  async todaySessions(req: FastifyRequest, reply: FastifyReply) { return reply.send({ sessions: await getTodaySessionsService(req.user.orgId) }); },
  async bookSession(req: FastifyRequest, reply: FastifyReply) { return reply.status(201).send({ session: await bookSessionService(req.user.orgId, req.body, req.user.userId) }); },
  async getSession(req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) { return reply.send({ session: await getSessionService(req.user.orgId, req.params.sessionId) }); },
  async updateSession(req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) { return reply.send({ session: await updateSessionService(req.user.orgId, req.params.sessionId, req.body) }); },
  async completeSession(req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) { return reply.send({ session: await completeSessionService(req.user.orgId, req.params.sessionId, (req.body as any)?.notes) }); },
  async cancelSession(req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) { return reply.send({ session: await cancelSessionService(req.user.orgId, req.params.sessionId, (req.body as any)?.reason ?? '') }); },
  async missSession(req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) { return reply.send({ session: await missSessionService(req.user.orgId, req.params.sessionId) }); },
};

import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  superAdminLogin,
  getAdminStats,
  listOrganizations,
  updateOrganizationStatus,
} from './admin.service';

export const adminController = {
  async login(req: FastifyRequest, reply: FastifyReply) {
    const result = await superAdminLogin(req.server, req.body);
    return reply.send(result);
  },

  async getStats(req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await getAdminStats());
  },

  async getOrganizations(req: FastifyRequest, reply: FastifyReply) {
    return reply.send({ organizations: await listOrganizations() });
  },

  async updateOrganizationStatus(req: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) {
    const status = (req.body as any).status;
    return reply.send({ organization: await updateOrganizationStatus(req.params.orgId, status) });
  },
};

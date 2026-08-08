import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  superAdminLogin,
  getAdminStats,
  listOrganizations,
  updateOrganizationStatus,
  getOrganizationBranches,
  resetOrganizationOwnerPassword,
  createOrganization,
  getGlobalAuditLogs,
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

  async getBranches(req: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) {
    return reply.send({ branches: await getOrganizationBranches(req.params.orgId) });
  },

  async resetOwnerPassword(req: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) {
    const newPassword = (req.body as any).newPassword;
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    return reply.send(await resetOrganizationOwnerPassword(req.params.orgId, newPassword));
  },

  async createOrg(req: FastifyRequest, reply: FastifyReply) {
    const payload = req.body as any;
    if (!payload.orgName || !payload.orgEmail || !payload.ownerEmail || !payload.ownerPassword) {
      throw new Error('Missing required fields for organization creation');
    }
    const result = await createOrganization(payload);
    return reply.send({ message: 'Organization created successfully', ...result });
  },

  async getAuditLogs(req: FastifyRequest, reply: FastifyReply) {
    return reply.send({ logs: await getGlobalAuditLogs() });
  },
};

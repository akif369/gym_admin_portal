import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  getOrgService, updateOrgService,
  listBranchesService, createBranchService, getBranchService, updateBranchService,
  getSettingsService, upsertSettingService,
} from './org.service';

export const orgController = {
  async getOrg(request: FastifyRequest, reply: FastifyReply) {
    const org = await getOrgService(request.user.orgId);
    return reply.send({ org });
  },

  async updateOrg(request: FastifyRequest, reply: FastifyReply) {
    const org = await updateOrgService(request.user.orgId, request.body as any);
    return reply.send({ org });
  },

  async listBranches(request: FastifyRequest, reply: FastifyReply) {
    const branches = await listBranchesService(request.user.orgId);
    return reply.send({ branches });
  },

  async createBranch(request: FastifyRequest, reply: FastifyReply) {
    const branch = await createBranchService(request.user.orgId, request.body as any);
    return reply.status(201).send({ branch });
  },

  async getBranch(request: FastifyRequest<{ Params: { branchId: string } }>, reply: FastifyReply) {
    const branch = await getBranchService(request.user.orgId, request.params.branchId);
    return reply.send({ branch });
  },

  async updateBranch(request: FastifyRequest<{ Params: { branchId: string } }>, reply: FastifyReply) {
    const branch = await updateBranchService(request.user.orgId, request.params.branchId, request.body as any);
    return reply.send({ branch });
  },

  async getSettings(request: FastifyRequest, reply: FastifyReply) {
    const settingsMap = await getSettingsService(request.user.orgId);
    return reply.send({ settings: settingsMap });
  },

  async updateSettingsCategory(category: string) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await upsertSettingService(
        request.user.orgId,
        category,
        request.body,
        request.user.userId,
      );
      return reply.send({ setting: result });
    };
  },
};

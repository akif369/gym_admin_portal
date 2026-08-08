import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  listLeadsService, createLeadService, getLeadService, updateLeadService,
  updateLeadStatusService, addLeadActivityService, convertLeadService,
  getLeadSourcesAnalyticsService, getLeadPipelineAnalyticsService,
} from './leads.service';

export const leadsController = {
  async list(req: FastifyRequest, reply: FastifyReply) { return reply.send(await listLeadsService(req.user.orgId, req.query as any)); },
  async create(req: FastifyRequest, reply: FastifyReply) { return reply.status(201).send({ lead: await createLeadService(req.user.orgId, req.body, req.user.userId) }); },
  async getOne(req: FastifyRequest<{ Params: { leadId: string } }>, reply: FastifyReply) { return reply.send({ lead: await getLeadService(req.user.orgId, req.params.leadId) }); },
  async update(req: FastifyRequest<{ Params: { leadId: string } }>, reply: FastifyReply) { return reply.send({ lead: await updateLeadService(req.user.orgId, req.params.leadId, req.body) }); },
  async updateStatus(req: FastifyRequest<{ Params: { leadId: string } }>, reply: FastifyReply) { return reply.send({ lead: await updateLeadStatusService(req.user.orgId, req.params.leadId, (req.body as any).status, req.user.userId) }); },
  async addActivity(req: FastifyRequest<{ Params: { leadId: string } }>, reply: FastifyReply) { return reply.status(201).send({ activity: await addLeadActivityService(req.user.orgId, req.params.leadId, req.body, req.user.userId) }); },
  async convert(req: FastifyRequest<{ Params: { leadId: string } }>, reply: FastifyReply) { return reply.send({ lead: await convertLeadService(req.user.orgId, req.params.leadId, req.user.userId) }); },
  async sourceAnalytics(req: FastifyRequest, reply: FastifyReply) { return reply.send({ sources: await getLeadSourcesAnalyticsService(req.user.orgId) }); },
  async pipelineAnalytics(req: FastifyRequest, reply: FastifyReply) { return reply.send({ pipeline: await getLeadPipelineAnalyticsService(req.user.orgId) }); },
};

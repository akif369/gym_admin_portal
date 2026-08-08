import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  listPlansService, createPlanService, getPlanService, updatePlanService, updatePlanStatusService,
  getMemberMembershipsService, getMembershipEventsService,
  createMembershipService, activateMembershipService, renewMembershipService,
  freezeMembershipService, resumeMembershipService, cancelMembershipService, extendMembershipService,
} from './memberships.service';

export const membershipsController = {
  async listPlans(request: FastifyRequest, reply: FastifyReply) {
    const plans = await listPlansService(request.user.orgId);
    return reply.send({ plans });
  },
  async createPlan(request: FastifyRequest, reply: FastifyReply) {
    const plan = await createPlanService(request.user.orgId, request.body as any);
    return reply.status(201).send({ plan });
  },
  async getPlan(request: FastifyRequest<{ Params: { planId: string } }>, reply: FastifyReply) {
    const plan = await getPlanService(request.user.orgId, request.params.planId);
    return reply.send({ plan });
  },
  async updatePlan(request: FastifyRequest<{ Params: { planId: string } }>, reply: FastifyReply) {
    const plan = await updatePlanService(request.user.orgId, request.params.planId, request.body as any);
    return reply.send({ plan });
  },
  async updatePlanStatus(request: FastifyRequest<{ Params: { planId: string } }>, reply: FastifyReply) {
    const { status } = request.body as { status: 'ACTIVE' | 'INACTIVE' };
    const plan = await updatePlanStatusService(request.user.orgId, request.params.planId, status);
    return reply.send({ plan });
  },
  async getMemberMemberships(request: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) {
    const memberships = await getMemberMembershipsService(request.params.memberId);
    return reply.send({ memberships });
  },
  async getMembershipEvents(request: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) {
    const events = await getMembershipEventsService(request.params.memberId);
    return reply.send({ events });
  },
  async createMembership(request: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) {
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    const membership = await createMembershipService(
      request.user.orgId, request.params.memberId,
      { ...(request.body as any), idempotencyKey },
      request.user.userId, `${request.user.role}`,
    );
    return reply.status(201).send({ membership });
  },
  async activateMembership(request: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) {
    const membership = await activateMembershipService(request.user.orgId, request.params.memberId, request.user.userId);
    return reply.send({ membership });
  },
  async renewMembership(request: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) {
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    const membership = await renewMembershipService(request.user.orgId, request.params.memberId, { ...(request.body as any), idempotencyKey }, request.user.userId);
    return reply.send({ membership });
  },
  async freezeMembership(request: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) {
    const membership = await freezeMembershipService(request.user.orgId, request.params.memberId, request.body as any, request.user.userId);
    return reply.send({ membership });
  },
  async resumeMembership(request: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) {
    const membership = await resumeMembershipService(request.user.orgId, request.params.memberId, request.user.userId);
    return reply.send({ membership });
  },
  async cancelMembership(request: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) {
    const { reason } = request.body as { reason: string };
    const membership = await cancelMembershipService(request.user.orgId, request.params.memberId, reason, request.user.userId);
    return reply.send({ membership });
  },
  async extendMembership(request: FastifyRequest<{ Params: { memberId: string } }>, reply: FastifyReply) {
    const { days, reason } = request.body as { days: number; reason: string };
    const membership = await extendMembershipService(request.user.orgId, request.params.memberId, days, reason, request.user.userId);
    return reply.send({ membership });
  },
};

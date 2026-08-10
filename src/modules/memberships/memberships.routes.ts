import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/auth/requireAuth';
import { requirePermission } from '../../common/auth/requirePermission';
import { membershipsController } from './memberships.controller';

export async function membershipsRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = [requireAuth];
  const authManage = [requireAuth, requirePermission('member.create')];

  // ── Plans ──────────────────────────────────────────────────────────────────
  fastify.get('/membership-plans', { preHandler: auth, schema: { tags: ['Memberships'], summary: 'List membership plans' } }, membershipsController.listPlans);
  fastify.post('/membership-plans', { preHandler: authManage, schema: { tags: ['Memberships'], summary: 'Create membership plan' } }, membershipsController.createPlan);
  fastify.get('/membership-plans/:planId', { preHandler: auth, schema: { tags: ['Memberships'], summary: 'Get plan detail' } }, membershipsController.getPlan);
  fastify.patch('/membership-plans/:planId', { preHandler: authManage, schema: { tags: ['Memberships'], summary: 'Update membership plan' } }, membershipsController.updatePlan);
  fastify.patch('/membership-plans/:planId/status', { preHandler: authManage, schema: { tags: ['Memberships'], summary: 'Enable/disable plan' } }, membershipsController.updatePlanStatus);

  // ── Org-wide Events ────────────────────────────────────────────────────────
  fastify.get('/membership-events', { preHandler: auth, schema: { tags: ['Memberships'], summary: 'List all membership events (org-wide, paginated)' } }, membershipsController.listEvents);

  // ── Member Membership Lifecycle ────────────────────────────────────────────
  fastify.get('/members/:memberId/memberships', { preHandler: auth, schema: { tags: ['Memberships'], summary: 'Member membership history' } }, membershipsController.getMemberMemberships);
  fastify.get('/members/:memberId/membership-events', { preHandler: auth, schema: { tags: ['Memberships'], summary: 'Immutable membership event log' } }, membershipsController.getMembershipEvents);
  fastify.post('/members/:memberId/memberships/create', { preHandler: authManage, schema: { tags: ['Memberships'], summary: 'Create membership for member' } }, membershipsController.createMembership);
  fastify.post('/members/:memberId/memberships/activate', { preHandler: authManage, schema: { tags: ['Memberships'], summary: 'Activate pending membership' } }, membershipsController.activateMembership);
  fastify.post('/members/:memberId/memberships/renew', { preHandler: authManage, schema: { tags: ['Memberships'], summary: 'Renew membership' } }, membershipsController.renewMembership);
  fastify.post('/members/:memberId/memberships/freeze', { preHandler: authManage, schema: { tags: ['Memberships'], summary: 'Freeze membership' } }, membershipsController.freezeMembership);
  fastify.post('/members/:memberId/memberships/resume', { preHandler: authManage, schema: { tags: ['Memberships'], summary: 'Resume frozen membership' } }, membershipsController.resumeMembership);
  fastify.post('/members/:memberId/memberships/extend', { preHandler: authManage, schema: { tags: ['Memberships'], summary: 'Extend membership expiry' } }, membershipsController.extendMembership);
  fastify.post('/members/:memberId/memberships/cancel', { preHandler: authManage, schema: { tags: ['Memberships'], summary: 'Cancel membership' } }, membershipsController.cancelMembership);
}

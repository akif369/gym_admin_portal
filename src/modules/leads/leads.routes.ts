import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/auth/requireAuth';
import { requirePermission } from '../../common/auth/requirePermission';
import { leadsController } from './leads.controller';

export async function leadsRoutes(fastify: FastifyInstance): Promise<void> {
  const authView = [requireAuth, requirePermission('lead.view')];
  const authManage = [requireAuth, requirePermission('lead.manage')];
  const authConvert = [requireAuth, requirePermission('lead.convert')];

  // Analytics must be registered BEFORE parameterised routes to avoid URL collision
  fastify.get('/analytics/sources', { preHandler: authView, schema: { tags: ['Leads'], summary: 'Lead source breakdown' } }, leadsController.sourceAnalytics);
  fastify.get('/analytics/pipeline', { preHandler: authView, schema: { tags: ['Leads'], summary: 'Pipeline stage counts' } }, leadsController.pipelineAnalytics);

  fastify.get('/', { preHandler: authView, schema: { tags: ['Leads'], summary: 'List leads (paginated)' } }, leadsController.list);
  fastify.post('/', { preHandler: authManage, schema: { tags: ['Leads'], summary: 'Create lead' } }, leadsController.create);
  fastify.get('/:leadId', { preHandler: authView, schema: { tags: ['Leads'], summary: 'Lead detail with activities' } }, leadsController.getOne);
  fastify.patch('/:leadId', { preHandler: authManage, schema: { tags: ['Leads'], summary: 'Update lead' } }, leadsController.update);
  fastify.patch('/:leadId/status', { preHandler: authManage, schema: { tags: ['Leads'], summary: 'Move pipeline stage' } }, leadsController.updateStatus);
  fastify.post('/:leadId/activities', { preHandler: authManage, schema: { tags: ['Leads'], summary: 'Add activity to lead' } }, leadsController.addActivity);
  fastify.post('/:leadId/convert', { preHandler: authConvert, schema: { tags: ['Leads'], summary: 'Convert lead to member' } }, leadsController.convert);
}

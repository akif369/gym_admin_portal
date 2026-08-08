import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/auth/requireAuth';
import { requirePermission } from '../../common/auth/requirePermission';
import { workoutsController } from './workouts.controller';

export async function workoutsRoutes(fastify: FastifyInstance): Promise<void> {
  const authView = [requireAuth, requirePermission('workout.view')];
  const authManage = [requireAuth, requirePermission('workout.manage')];

  fastify.get('/exercises', { preHandler: authView, schema: { tags: ['Workouts'], summary: 'List exercise library' } }, workoutsController.listExercises as any);
  fastify.post('/exercises', { preHandler: authManage, schema: { tags: ['Workouts'], summary: 'Create exercise' } }, workoutsController.createExercise as any);
  fastify.get('/exercises/:exerciseId', { preHandler: authView, schema: { tags: ['Workouts'], summary: 'Exercise detail' } }, workoutsController.getExercise as any);
  fastify.patch('/exercises/:exerciseId', { preHandler: authManage, schema: { tags: ['Workouts'], summary: 'Update exercise' } }, workoutsController.updateExercise as any);
  fastify.patch('/exercises/:exerciseId/status', { preHandler: authManage, schema: { tags: ['Workouts'], summary: 'Enable/disable exercise' } }, workoutsController.updateExerciseStatus as any);
  fastify.get('/workout-templates', { preHandler: authView, schema: { tags: ['Workouts'], summary: 'List workout templates' } }, workoutsController.listTemplates as any);
  fastify.post('/workout-templates', { preHandler: authManage, schema: { tags: ['Workouts'], summary: 'Create workout template' } }, workoutsController.createTemplate as any);
  fastify.get('/workout-templates/:templateId', { preHandler: authView, schema: { tags: ['Workouts'], summary: 'Template detail with exercises' } }, workoutsController.getTemplate as any);
  fastify.patch('/workout-templates/:templateId', { preHandler: authManage, schema: { tags: ['Workouts'], summary: 'Update workout template' } }, workoutsController.updateTemplate as any);
  fastify.post('/workout-templates/:templateId/assign', { preHandler: authManage, schema: { tags: ['Workouts'], summary: 'Assign template to members' } }, workoutsController.assignTemplate as any);
}

import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  listExercisesService, createExerciseService, getExerciseService, updateExerciseService, updateExerciseStatusService,
  listWorkoutTemplatesService, createWorkoutTemplateService, getWorkoutTemplateService, updateWorkoutTemplateService, assignWorkoutTemplateService,
} from './workouts.service';

type Req = FastifyRequest & { user: { orgId: string; userId: string } };
type Params<T> = FastifyRequest<{ Params: T }> & { user: { orgId: string; userId: string } };

export const workoutsController = {
  async listExercises(req: FastifyRequest, reply: FastifyReply) { const r = req as Req; return reply.send(await listExercisesService(r.user.orgId, r.query as any)); },
  async createExercise(req: FastifyRequest, reply: FastifyReply) { const r = req as Req; return reply.status(201).send({ exercise: await createExerciseService(r.user.orgId, r.body, r.user.userId) }); },
  async getExercise(req: FastifyRequest, reply: FastifyReply) { const r = req as Params<{ exerciseId: string }>; return reply.send({ exercise: await getExerciseService(r.user.orgId, r.params.exerciseId) }); },
  async updateExercise(req: FastifyRequest, reply: FastifyReply) { const r = req as Params<{ exerciseId: string }>; return reply.send({ exercise: await updateExerciseService(r.user.orgId, r.params.exerciseId, r.body) }); },
  async updateExerciseStatus(req: FastifyRequest, reply: FastifyReply) { const r = req as Params<{ exerciseId: string }>; return reply.send({ exercise: await updateExerciseStatusService(r.user.orgId, r.params.exerciseId, (r.body as any).isActive) }); },
  async listTemplates(req: FastifyRequest, reply: FastifyReply) { const r = req as Req; return reply.send(await listWorkoutTemplatesService(r.user.orgId, r.query as any)); },
  async createTemplate(req: FastifyRequest, reply: FastifyReply) { const r = req as Req; return reply.status(201).send({ template: await createWorkoutTemplateService(r.user.orgId, r.body, r.user.userId) }); },
  async getTemplate(req: FastifyRequest, reply: FastifyReply) { const r = req as Params<{ templateId: string }>; return reply.send({ template: await getWorkoutTemplateService(r.user.orgId, r.params.templateId) }); },
  async updateTemplate(req: FastifyRequest, reply: FastifyReply) { const r = req as Params<{ templateId: string }>; return reply.send({ template: await updateWorkoutTemplateService(r.user.orgId, r.params.templateId, r.body) }); },
  async assignTemplate(req: FastifyRequest, reply: FastifyReply) { const r = req as Params<{ templateId: string }>; return reply.send({ assigned: await assignWorkoutTemplateService(r.user.orgId, r.params.templateId, (r.body as any).memberIds, r.user.userId) }); },
};

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/auth/requireAuth';
import { searchController } from './search.controller';

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', {
    preHandler: [requireAuth],
    schema: { tags: ['Search'], summary: 'Search members and payments available to the current user' },
  }, searchController.search);
}

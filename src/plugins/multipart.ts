import type { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { config } from '../config/env';

export async function registerMultipart(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: config.maxFileSizeMb * 1024 * 1024,
      files: 1,
      fieldSize: 1024 * 1024, // 1 MB for text fields
    },
  });
}

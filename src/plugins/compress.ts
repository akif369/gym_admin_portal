import type { FastifyInstance } from 'fastify';
import fastifyCompress from '@fastify/compress';

export async function registerCompress(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyCompress, {
    global: true,
    encodings: ['gzip', 'deflate'],
    threshold: 1024, // Only compress responses > 1 KB
  });
}

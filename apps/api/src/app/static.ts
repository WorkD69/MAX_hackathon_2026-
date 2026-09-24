import path from 'node:path';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type pino from 'pino';

export type RuntimeFastifyInstance = FastifyInstance<Server, IncomingMessage, ServerResponse, pino.Logger>;

export interface StaticAssets {
  readonly root: string;
  readonly prefix: '/';
  readonly index: 'index.html';
}

export function allowedPath(pathName: string): boolean {
  const segments = pathName.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase().split('/').filter(Boolean);
  const first = segments[0];
  return first !== 'health' && first !== 'integrations' && !(first === 'api' && segments[1] === 'v1');
}

export async function registerStaticAssets(app: RuntimeFastifyInstance, descriptor: StaticAssets): Promise<void> {
  if (!path.isAbsolute(descriptor.root) || descriptor.prefix !== '/' || descriptor.index !== 'index.html') {
    throw new Error('INVALID_STATIC_DESCRIPTOR');
  }
  await app.register(fastifyStatic, {
    root: descriptor.root,
    prefix: descriptor.prefix,
    index: descriptor.index,
    wildcard: true,
    allowedPath,
  });
}

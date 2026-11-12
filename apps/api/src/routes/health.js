import { Router } from 'express';
import { APP_NAME } from '@balancevault/shared';

export function createHealthRouter({ prisma, redisClient }) {
  const router = Router();

  router.get('/health', (_request, response) => response.status(200).json({
    success: true,
    data: { application: APP_NAME, status: 'ok' },
  }));

  router.get('/ready', async (_request, response) => {
    const dependencies = { postgres: 'unavailable', redis: 'unavailable' };
    if (prisma) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        dependencies.postgres = 'ready';
      } catch {
        dependencies.postgres = 'unavailable';
      }
    }
    if (redisClient?.isReady) {
      try {
        await redisClient.ping();
        dependencies.redis = 'ready';
      } catch {
        dependencies.redis = 'unavailable';
      }
    }

    const ready = dependencies.postgres === 'ready' && dependencies.redis === 'ready';
    return response.status(ready ? 200 : 503).json({
      success: ready,
      data: { application: APP_NAME, status: ready ? 'ready' : 'not_ready', dependencies },
    });
  });

  return router;
}
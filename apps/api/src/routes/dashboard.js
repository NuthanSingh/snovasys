import { Router } from 'express';
import { createDashboardController } from '../controllers/dashboard-controller.js';
import { authenticate } from '../middleware/authenticate.js';

export function createDashboardRouter({ prisma, redisClient, configuration }) {
  const router = Router();
  const controller = createDashboardController({ prisma });
  router.get('/me', authenticate({ prisma, redisClient, configuration }), controller.user);
  return router;
}
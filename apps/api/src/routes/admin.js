import { Router } from 'express';
import { adminAccess } from '../controllers/admin-controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createAdminOnboardingRouter } from './admin-onboarding.js';
import { createAdminManagementRouter } from './admin-management.js';

export function createAdminRouter({ prisma, redisClient, configuration }) {
  const router = Router();
  router.use(authenticate({ prisma, redisClient, configuration }));
  router.get('/access', requireRole('ADMIN'), adminAccess);
  router.use('/onboarding', createAdminOnboardingRouter({ prisma }));
  router.use('/', createAdminManagementRouter({ prisma, configuration }));
  return router;
}
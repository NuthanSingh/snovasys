import { Router } from 'express';
import { createUsersController } from '../controllers/users-controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTrustedOrigin } from '../middleware/trusted-origin.js';
import { validateBody } from '../validators/auth.js';
import { ownProfileUpdateSchema } from '../validators/management.js';

export function createUsersRouter({ prisma, redisClient, configuration }) {
  const router = Router();
  const controller = createUsersController({ prisma });
  router.use(authenticate({ prisma, redisClient, configuration }));
  router.use(requireTrustedOrigin(configuration));
  router.get('/me', controller.getOwn);
  router.put('/me', validateBody(ownProfileUpdateSchema), controller.updateOwn);
  return router;
}
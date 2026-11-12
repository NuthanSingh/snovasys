import { Router } from 'express';
import { createOnboardingController } from '../controllers/onboarding-controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../validators/auth.js';
import { onboardingRequestIdSchema, onboardingSubmissionSchema, validateParams } from '../validators/onboarding.js';

export function createOnboardingRouter({ prisma, redisClient, configuration }) {
  const router = Router();
  const controller = createOnboardingController({ prisma });
  router.use(authenticate({ prisma, redisClient, configuration }));
  router.post('/', validateBody(onboardingSubmissionSchema), controller.submit);
  router.get('/me', controller.listOwn);
  router.get('/:requestId', validateParams(onboardingRequestIdSchema), controller.getOwn);
  return router;
}
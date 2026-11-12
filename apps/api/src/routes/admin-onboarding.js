import { Router } from 'express';
import { createAdminOnboardingController } from '../controllers/admin-onboarding-controller.js';
import { requireRole } from '../middleware/authorize.js';
import { validateBody } from '../validators/auth.js';
import {
  onboardingRequestIdSchema,
  onboardingReviewSchema,
  onboardingStatusQuerySchema,
  validateParams,
} from '../validators/onboarding.js';

export function createAdminOnboardingRouter({ prisma }) {
  const router = Router();
  const controller = createAdminOnboardingController({ prisma });
  const requireAdmin = requireRole('ADMIN');

  router.get('/', requireAdmin, (request, response, next) => {
    const result = onboardingStatusQuerySchema.safeParse(request.query);
    if (!result.success) {
      return response.status(400).json({
        success: false,
        error: { message: 'Invalid onboarding status filter.', code: 'INVALID_FILTER' },
      });
    }
    request.onboardingStatus = result.data.status;
    return next();
  }, controller.list);
  router.get('/:requestId', requireAdmin, validateParams(onboardingRequestIdSchema), controller.get);
  router.put('/:requestId/review', requireAdmin, validateParams(onboardingRequestIdSchema), validateBody(onboardingReviewSchema), controller.review);
  return router;
}
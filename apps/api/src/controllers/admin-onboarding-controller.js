import {
  getAdminOnboarding,
  listAdminOnboarding,
  reviewOnboarding,
} from '../services/onboarding-service.js';

export function createAdminOnboardingController({ prisma }) {
  return {
    list: async (request, response, next) => {
      try {
        const requests = await listAdminOnboarding({ prisma, status: request.onboardingStatus });
        return response.status(200).json({ success: true, data: { requests } });
      } catch (error) {
        return next(error);
      }
    },

    get: async (request, response, next) => {
      try {
        const onboardingRequest = await getAdminOnboarding({ prisma, requestId: request.requestId });
        return response.status(200).json({ success: true, data: { request: onboardingRequest } });
      } catch (error) {
        return next(error);
      }
    },

    review: async (request, response, next) => {
      try {
        const onboardingRequest = await reviewOnboarding({
          prisma,
          adminId: request.auth.userId,
          requestId: request.requestId,
          status: request.validatedBody.status,
          comment: request.validatedBody.comment,
        });
        return response.status(200).json({ success: true, data: { request: onboardingRequest } });
      } catch (error) {
        return next(error);
      }
    },
  };
}
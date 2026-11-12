import {
  getOwnOnboarding,
  listOwnOnboarding,
  submitOnboarding,
} from '../services/onboarding-service.js';

export function createOnboardingController({ prisma }) {
  return {
    submit: async (request, response, next) => {
      try {
        const onboardingRequest = await submitOnboarding({
          prisma,
          userId: request.auth.userId,
          input: request.validatedBody,
        });
        return response.status(201).json({ success: true, data: { request: onboardingRequest } });
      } catch (error) {
        return next(error);
      }
    },

    listOwn: async (request, response, next) => {
      try {
        const requests = await listOwnOnboarding({ prisma, userId: request.auth.userId });
        return response.status(200).json({ success: true, data: { requests } });
      } catch (error) {
        return next(error);
      }
    },

    getOwn: async (request, response, next) => {
      try {
        const onboardingRequest = await getOwnOnboarding({
          prisma,
          userId: request.auth.userId,
          requestId: request.requestId,
        });
        return response.status(200).json({ success: true, data: { request: onboardingRequest } });
      } catch (error) {
        return next(error);
      }
    },
  };
}
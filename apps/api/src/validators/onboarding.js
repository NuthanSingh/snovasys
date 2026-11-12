import { z } from 'zod';

export const onboardingRequestIdSchema = z.string().uuid();

export const onboardingSubmissionSchema = z.object({
  phoneNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  addressLine: z.string().trim().min(5).max(200),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9 -]+$/),
  countryCode: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
}).strict();

export const onboardingReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().trim().max(500).optional().transform((value) => value || null),
}).strict();

export const onboardingStatusQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
}).strict();

export function validateParams(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.params.requestId);
    if (!result.success) {
      return response.status(400).json({
        success: false,
        error: { message: 'A valid request ID is required.', code: 'INVALID_REQUEST_ID' },
      });
    }
    request.requestId = result.data;
    return next();
  };
}
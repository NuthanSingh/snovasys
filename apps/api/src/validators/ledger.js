import { z } from 'zod';

const positiveAmount = z.string()
  .regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/)
  .refine((value) => /[1-9]/.test(value), 'Amount must be greater than zero.');

export const transferSchema = z.object({
  destinationAccountId: z.string().uuid(),
  amount: positiveAmount,
  description: z.string().trim().min(1).max(240).optional().transform((value) => value || 'Synthetic account transfer'),
}).strict();

export const syntheticDepositSchema = z.object({
  amount: positiveAmount,
  description: z.string().trim().min(1).max(240).optional().transform((value) => value || 'Synthetic demonstration deposit'),
}).strict();

export const adminTransactionQuerySchema = z.object({
  type: z.enum(['DEPOSIT', 'TRANSFER']).optional(),
  status: z.enum(['COMPLETED']).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export function requireIdempotencyKey(request, response, next) {
  const key = request.get('idempotency-key');
  if (typeof key !== 'string' || key.length < 16 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    return response.status(400).json({
      success: false,
      error: { message: 'A valid Idempotency-Key header is required.', code: 'IDEMPOTENCY_KEY_REQUIRED' },
    });
  }
  request.idempotencyKey = key;
  return next();
}
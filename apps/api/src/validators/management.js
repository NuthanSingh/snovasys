import { z } from 'zod';

const userStatusFilter = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']);
const accountStatusFilter = z.enum(['PENDING', 'ACTIVE', 'FROZEN', 'CLOSED']);
const roleFilter = z.enum(['ADMIN', 'USER', 'BOOTSTRAP_ADMIN']);

export const userListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: roleFilter.optional(),
  status: userStatusFilter.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const accountListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: accountStatusFilter.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const auditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().trim().max(120).optional(),
}).strict();

export const userUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

export const ownProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
}).strict();

export const accountCreateSchema = z.object({
  type: z.enum(['CHECKING', 'SAVINGS']),
}).strict();

export const accountStatusUpdateSchema = z.object({
  status: accountStatusFilter,
}).strict();

export function validateQuery(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.query);
    if (!result.success) {
      return response.status(400).json({
        success: false,
        error: { message: 'Invalid query parameters.', code: 'INVALID_QUERY' },
      });
    }
    request.validatedQuery = result.data;
    return next();
  };
}

export function validatePathId(parameterName) {
  const schema = z.string().uuid();
  return (request, response, next) => {
    const result = schema.safeParse(request.params[parameterName]);
    if (!result.success) {
      return response.status(400).json({
        success: false,
        error: { message: `A valid ${parameterName} is required.`, code: 'INVALID_ID' },
      });
    }
    request.validatedIds ??= {};
    request.validatedIds[parameterName] = result.data;
    return next();
  };
}
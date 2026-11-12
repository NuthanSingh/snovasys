import { z } from 'zod';

const emailSchema = z.string().trim().email().max(320).transform((email) => email.toLowerCase());
const passwordSchema = z.string()
  .min(12)
  .max(72)
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72);
const fullNameSchema = z.string().trim().min(2).max(120);

export const registerSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
}).strict();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72).refine((password) => Buffer.byteLength(password, 'utf8') <= 72),
}).strict();

export const bootstrapAdminSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
}).strict();

export function validateBody(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      return response.status(400).json({
        success: false,
        error: {
          message: 'Request validation failed.',
          details: result.error.issues.map(({ path, message }) => ({ path, message })),
        },
      });
    }

    request.validatedBody = result.data;
    return next();
  };
}
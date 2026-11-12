import { Router } from 'express';
import { createAuthController } from '../controllers/auth-controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { HttpError } from '../lib/http-error.js';
import { validateBody, loginSchema, registerSchema } from '../validators/auth.js';

function trustedOrigin(configuration) {
  return (request, _response, next) => {
    const origin = request.get('origin');
    if (origin && origin !== configuration.webOrigin) {
      return next(new HttpError(403, 'Request origin is not allowed.', 'ORIGIN_NOT_ALLOWED'));
    }
    return next();
  };
}

export function createAuthRouter({ prisma, redisClient, configuration, rateLimiter, passwordHasher }) {
  const router = Router();
  const controller = createAuthController({ prisma, redisClient, configuration, passwordHasher });
  const checkOrigin = trustedOrigin(configuration);
  const requireSession = authenticate({ prisma, redisClient, configuration });

  router.post('/register', rateLimiter, checkOrigin, validateBody(registerSchema), controller.register);
  router.post('/login', rateLimiter, checkOrigin, validateBody(loginSchema), controller.login);
  router.post('/logout', checkOrigin, requireSession, controller.logout);
  router.get('/me', requireSession, controller.me);

  return router;
}
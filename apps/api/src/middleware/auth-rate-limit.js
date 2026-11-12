import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

function unavailable(_request, response) {
  return response.status(503).json({
    success: false,
    error: { message: 'Authentication rate limiting is unavailable.', code: 'SERVICE_UNAVAILABLE' },
  });
}

export function createAuthRateLimiter(redisClient, {
  windowMs,
  max,
  prefix = 'balancevault:rate:auth:',
}) {
  if (!redisClient) {
    return unavailable;
  }

  const limiter = rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: new RedisStore({
      prefix,
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
    handler: (_request, response) => response.status(429).json({
      success: false,
      error: { message: 'Too many authentication attempts. Try again later.', code: 'RATE_LIMITED' },
    }),
  });

  return (request, response, next) => {
    if (!redisClient.isReady) {
      return unavailable(request, response);
    }
    return limiter(request, response, (error) => {
      if (error) {
        return next(new Error('Authentication rate limiting is unavailable.', { cause: error }));
      }
      return next();
    });
  };
}
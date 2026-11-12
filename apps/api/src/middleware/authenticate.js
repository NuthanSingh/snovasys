import { HttpError } from '../lib/http-error.js';
import { serializeUser, verifySessionToken } from '../services/auth-service.js';

export const SESSION_COOKIE_NAME = 'balancevault_session';

export function authenticate({ prisma, redisClient, configuration }) {
  return async (request, _response, next) => {
    if (!prisma || !redisClient?.isReady) {
      return next(new HttpError(503, 'Authentication services are unavailable.', 'SERVICE_UNAVAILABLE'));
    }

    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      return next(new HttpError(401, 'Authentication is required.', 'AUTHENTICATION_REQUIRED'));
    }

    try {
      const claims = verifySessionToken(token, configuration);
      if (typeof claims.sub !== 'string' || typeof claims.jti !== 'string' || !Number.isInteger(claims.exp)) {
        throw new Error('Invalid session claims.');
      }

      if (await redisClient.get(`balancevault:revoked:${claims.jti}`)) {
        throw new Error('Session is no longer valid.');
      }

      const user = await prisma.user.findUnique({
        where: { id: claims.sub },
        include: { role: true },
      });
      if (!user || ['SUSPENDED', 'CLOSED'].includes(user.status)) {
        throw new Error('Session is no longer valid.');
      }

      request.auth = {
        userId: user.id,
        role: user.role.name,
        tokenId: claims.jti,
        expiresAt: claims.exp,
        user: serializeUser(user),
      };
      return next();
    } catch (error) {
      if (error instanceof HttpError) {
        return next(error);
      }
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.message === 'Invalid session claims.' || error.message === 'Session is no longer valid.') {
        return next(new HttpError(401, 'Session is invalid or expired.', 'INVALID_SESSION'));
      }
      if (error.code === 'AUTH_NOT_CONFIGURED') {
        return next(error);
      }
      return next(new HttpError(503, 'Authentication services are unavailable.', 'SERVICE_UNAVAILABLE'));
    }
  };
}
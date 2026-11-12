import { HttpError } from '../lib/http-error.js';
import { SESSION_COOKIE_NAME } from '../middleware/authenticate.js';
import {
  createSessionToken,
  loginUser,
  registerUser,
  serializeUser,
} from '../services/auth-service.js';

function cookieOptions(configuration, maxAge) {
  return {
    httpOnly: true,
    secure: configuration.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api',
    maxAge,
  };
}

function setSessionCookie(response, userId, configuration) {
  const session = createSessionToken(userId, configuration);
  response.cookie(SESSION_COOKIE_NAME, session.token, cookieOptions(configuration, session.expiresInSeconds * 1000));
}

export function createAuthController({ prisma, redisClient, configuration, passwordHasher }) {
  return {
    register: async (request, response, next) => {
      try {
        if (!redisClient?.isReady) {
          throw new HttpError(503, 'Authentication services are unavailable.', 'SERVICE_UNAVAILABLE');
        }
        const user = await registerUser({ prisma, input: request.validatedBody, passwordHasher });
        setSessionCookie(response, user.id, configuration);
        return response.status(201).json({ success: true, data: { user: serializeUser(user) } });
      } catch (error) {
        return next(error);
      }
    },

    login: async (request, response, next) => {
      try {
        if (!redisClient?.isReady) {
          throw new HttpError(503, 'Authentication services are unavailable.', 'SERVICE_UNAVAILABLE');
        }
        const user = await loginUser({ prisma, input: request.validatedBody });
        setSessionCookie(response, user.id, configuration);
        return response.status(200).json({ success: true, data: { user: serializeUser(user) } });
      } catch (error) {
        return next(error);
      }
    },

    logout: async (request, response, next) => {
      try {
        if (!redisClient?.isReady) {
          throw new HttpError(503, 'Authentication services are unavailable.', 'SERVICE_UNAVAILABLE');
        }
        const remainingSeconds = Math.max(1, request.auth.expiresAt - Math.floor(Date.now() / 1000));
        await redisClient.set(`balancevault:revoked:${request.auth.tokenId}`, '1', { EX: remainingSeconds });
        response.clearCookie(SESSION_COOKIE_NAME, cookieOptions(configuration, 0));
        await prisma.auditLog.create({
          data: {
            actorId: request.auth.userId,
            action: 'AUTH_LOGOUT',
            targetType: 'User',
            targetId: request.auth.userId,
            result: 'SUCCESS',
          },
        });
        return response.status(200).json({ success: true, data: { message: 'Logged out successfully.' } });
      } catch (error) {
        return next(error);
      }
    },

    me: (request, response) => response.status(200).json({
      success: true,
      data: { user: request.auth.user },
    }),
  };
}
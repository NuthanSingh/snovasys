import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { HttpError } from '../lib/http-error.js';

const dummyPasswordHash = bcrypt.hash(randomBytes(32).toString('base64url'), 12);
const jwtIssuer = 'balancevault-api';
const jwtAudience = 'balancevault-web';

export function serializeUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    status: user.status,
    role: user.role?.name ?? null,
    createdAt: user.createdAt,
  };
}

export function assertAuthConfiguration(configuration) {
  const secret = configuration.jwtSecret;
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32 || secret.startsWith('replace_with_')) {
    throw new HttpError(503, 'Authentication is not configured.', 'AUTH_NOT_CONFIGURED');
  }
}

export function tokenLifetimeSeconds(value) {
  const match = /^(\d+)(s|m|h|d)$/.exec(value ?? '');
  if (!match) {
    throw new HttpError(503, 'Authentication is not configured.', 'AUTH_NOT_CONFIGURED');
  }

  const amount = Number(match[1]);
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  const seconds = amount * multiplier;
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) {
    throw new HttpError(503, 'Authentication is not configured.', 'AUTH_NOT_CONFIGURED');
  }
  return seconds;
}

export function createSessionToken(userId, configuration) {
  assertAuthConfiguration(configuration);
  const expiresInSeconds = tokenLifetimeSeconds(configuration.jwtExpiresIn);
  const tokenId = randomUUID();
  const token = jwt.sign({ jti: tokenId }, configuration.jwtSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: jwtIssuer,
    audience: jwtAudience,
    expiresIn: expiresInSeconds,
  });
  return { token, tokenId, expiresInSeconds };
}

export function verifySessionToken(token, configuration) {
  assertAuthConfiguration(configuration);
  return jwt.verify(token, configuration.jwtSecret, {
    algorithms: ['HS256'],
    issuer: jwtIssuer,
    audience: jwtAudience,
  });
}

export async function registerUser({ prisma, input, passwordHasher = bcrypt.hash }) {
  if (!prisma) {
    throw new HttpError(503, 'The account service is unavailable.', 'SERVICE_UNAVAILABLE');
  }

  const role = await prisma.role.findUnique({ where: { name: 'USER' } });
  if (!role) {
    throw new HttpError(503, 'User registration is not initialized.', 'ROLES_NOT_INITIALIZED');
  }

  const passwordHash = await passwordHasher(input.password, 12);
  try {
    return await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          fullName: input.fullName,
          email: input.email,
          passwordHash,
          roleId: role.id,
        },
        include: { role: true },
      });

      await transaction.auditLog.create({
        data: {
          actorId: user.id,
          action: 'USER_REGISTERED',
          targetType: 'User',
          targetId: user.id,
          result: 'SUCCESS',
        },
      });
      return user;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new HttpError(409, 'An account with that email already exists.', 'EMAIL_IN_USE');
    }
    throw error;
  }
}

export async function loginUser({ prisma, input, passwordComparer = bcrypt.compare }) {
  if (!prisma) {
    throw new HttpError(503, 'The account service is unavailable.', 'SERVICE_UNAVAILABLE');
  }

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { role: true },
  });
  const comparisonHash = user?.passwordHash ?? await dummyPasswordHash;
  const passwordMatches = await passwordComparer(input.password, comparisonHash);
  const accountEnabled = user && !['SUSPENDED', 'CLOSED'].includes(user.status);

  if (!user || !passwordMatches || !accountEnabled) {
    await prisma.auditLog.create({
      data: {
        actorId: user?.id ?? null,
        action: 'AUTH_LOGIN',
        targetType: 'User',
        targetId: user?.id ?? null,
        result: 'FAILURE',
        metadata: { reason: 'invalid_credentials' },
      },
    });
    throw new HttpError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
  }

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'AUTH_LOGIN',
      targetType: 'User',
      targetId: user.id,
      result: 'SUCCESS',
    },
  });
  return user;
}

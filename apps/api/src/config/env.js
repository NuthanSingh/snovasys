import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });

const port = Number(process.env.PORT ?? 4000);
const nodeEnv = process.env.NODE_ENV ?? 'development';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test, or production.');
}

function validateProductionConfiguration(configuration) {
  const issues = [];

  if (!configuration.databaseUrl) issues.push('DATABASE_URL is required');
  else if (!/^postgres(?:ql)?:\/\//i.test(configuration.databaseUrl)) issues.push('DATABASE_URL must use PostgreSQL');

  if (!configuration.redisUrl) issues.push('REDIS_URL is required');
  else if (!/^rediss?:\/\//i.test(configuration.redisUrl)) issues.push('REDIS_URL must use Redis');

  if (typeof configuration.jwtSecret !== 'string'
    || Buffer.byteLength(configuration.jwtSecret) < 32
    || configuration.jwtSecret.startsWith('replace_with_')) {
    issues.push('JWT_SECRET must be a non-placeholder value of at least 32 bytes');
  }

  try {
    const origin = new URL(configuration.webOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== configuration.webOrigin) {
      issues.push('WEB_ORIGIN must be an exact HTTPS origin');
    }
  } catch {
    issues.push('WEB_ORIGIN must be an exact HTTPS origin');
  }

  if (issues.length) {
    throw new Error(`Invalid production configuration: ${issues.join('; ')}.`);
  }
}

export const env = {
  nodeEnv,
  port,
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 900000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 10),
};

if (nodeEnv === 'production') {
  validateProductionConfiguration(env);
}
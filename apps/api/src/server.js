import { APP_NAME } from '@balancevault/shared';
import { createPrismaClient } from '@balancevault/database';
import { createClient } from 'redis';
import { createApp } from './app.js';
import { env } from './config/env.js';

async function connectDependencies() {
  let prisma = null;
  let redisClient = null;

  if (env.databaseUrl) {
    prisma = createPrismaClient({ connectionString: env.databaseUrl });
    try {
      await prisma.$connect();
    } catch {
      console.error('PostgreSQL is unavailable; database-backed endpoints will fail closed.');
      await prisma.$disconnect();
      prisma = null;
    }
  }

  if (env.redisUrl) {
    redisClient = createClient({
      url: env.redisUrl,
      socket: { connectTimeout: 2000, reconnectStrategy: false },
    });
    redisClient.on('error', () => console.error('Redis client error.'));
    try {
      await redisClient.connect();
    } catch {
      console.error('Redis is unavailable; authentication endpoints will fail closed.');
      redisClient = null;
    }
  }

  return { prisma, redisClient };
}

const { prisma, redisClient } = await connectDependencies();
const app = createApp({ prisma, redisClient, configuration: env });
const server = app.listen(env.port, () => {
  console.info(JSON.stringify({
    event: 'api_listening',
    application: APP_NAME,
    port: env.port,
  }));
});

server.on('error', () => {
  console.error(JSON.stringify({ event: 'api_server_error' }));
  process.exitCode = 1;
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(JSON.stringify({ event: 'api_shutdown_started', signal }));

  await new Promise((resolve) => {
    server.close((error) => {
      if (error) {
        console.error(JSON.stringify({ event: 'api_http_close_error' }));
        process.exitCode = 1;
      }
      resolve();
    });
  });

  try {
    await prisma?.$disconnect();
  } catch {
    console.error(JSON.stringify({ event: 'api_database_disconnect_error' }));
    process.exitCode = 1;
  }

  try {
    if (redisClient?.isOpen) await redisClient.quit();
  } catch {
    console.error(JSON.stringify({ event: 'api_redis_disconnect_error' }));
    process.exitCode = 1;
  }

  console.info(JSON.stringify({ event: 'api_shutdown_complete' }));
}

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
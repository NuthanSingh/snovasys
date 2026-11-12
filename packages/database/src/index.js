import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';

export { PrismaClient };

export function createPrismaClient({ connectionString = process.env.DATABASE_URL } = {}) {
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set before creating a Prisma client.');
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
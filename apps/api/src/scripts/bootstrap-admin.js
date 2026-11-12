import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@balancevault/database';
import { bootstrapFirstAdmin, BOOTSTRAP_CONFIRMATION } from '../services/bootstrap-admin.js';

dotenv.config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });

const required = ['BOOTSTRAP_ADMIN_FULL_NAME', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD'];
const missing = required.filter((name) => !process.env[name]);
let prisma;

try {
  if (missing.length || process.env.BOOTSTRAP_ADMIN_CONFIRM !== BOOTSTRAP_CONFIRMATION) {
    throw new Error('Set the one-time bootstrap values and confirmation in the ignored root .env.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for first-admin bootstrap.');
  }

  prisma = createPrismaClient({ connectionString: process.env.DATABASE_URL });
  await bootstrapFirstAdmin({
    prisma,
    fullName: process.env.BOOTSTRAP_ADMIN_FULL_NAME,
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    confirmation: process.env.BOOTSTRAP_ADMIN_CONFIRM,
  });
  console.info('First administrator created and audited. Remove bootstrap values from .env now.');
} catch (error) {
  console.error(error.message || 'First-admin bootstrap failed.');
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
}
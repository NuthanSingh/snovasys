import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../src/index.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const prisma = createPrismaClient({ connectionString: process.env.DIRECT_URL });

const roles = [
  { name: 'USER', description: 'Personal access to the signed-in user\'s own synthetic account data.' },
  { name: 'ADMIN', description: 'Administrative access to approved management operations.' },
  { name: 'BOOTSTRAP_ADMIN', description: 'Restricted responsibilities for initial administrator provisioning.' },
];

try {
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  console.info('BalanceVault role records are ready. No user or administrator was created.');
} finally {
  await prisma.$disconnect();
}
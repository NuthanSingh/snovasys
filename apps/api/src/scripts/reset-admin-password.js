import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@balancevault/database';

dotenv.config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });

const email = process.env.ADMIN_PASSWORD_RESET_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD_RESET_PASSWORD;
const confirmation = process.env.ADMIN_PASSWORD_RESET_CONFIRM;

if (confirmation !== 'RESET_ADMIN_PASSWORD') {
  throw new Error('Explicit admin password reset confirmation is required.');
}
if (!email || !password) {
  throw new Error('ADMIN_PASSWORD_RESET_EMAIL and ADMIN_PASSWORD_RESET_PASSWORD are required.');
}
if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
  throw new Error('The password must be at least 12 characters and no more than 72 UTF-8 bytes.');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for the admin password reset.');
}

const prisma = createPrismaClient({ connectionString: process.env.DATABASE_URL });

try {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (!user || user.role?.name !== 'ADMIN') {
      throw new Error('The requested user was not found as an ADMIN.');
    }

    await transaction.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await transaction.auditLog.create({
      data: {
        actorId: null,
        action: 'ADMIN_PASSWORD_RESET',
        targetType: 'User',
        targetId: user.id,
        result: 'SUCCESS',
        metadata: { source: 'protected_cli' },
      },
    });
  }, { isolationLevel: 'Serializable' });

  console.info('Administrator password updated and audited.');
} finally {
  await prisma.$disconnect();
}

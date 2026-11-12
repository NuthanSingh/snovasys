import bcrypt from 'bcrypt';
import { HttpError } from '../lib/http-error.js';
import { serializeUser } from './auth-service.js';
import { bootstrapAdminSchema } from '../validators/auth.js';

export const BOOTSTRAP_CONFIRMATION = 'CREATE_FIRST_ADMIN';

export async function bootstrapFirstAdmin({
  prisma,
  fullName,
  email,
  password,
  confirmation,
  passwordHasher = bcrypt.hash,
}) {
  if (confirmation !== BOOTSTRAP_CONFIRMATION) {
    throw new HttpError(403, 'Explicit first-admin bootstrap confirmation is required.', 'BOOTSTRAP_CONFIRMATION_REQUIRED');
  }
  if (!prisma) {
    throw new HttpError(503, 'The account service is unavailable.', 'SERVICE_UNAVAILABLE');
  }

  const input = bootstrapAdminSchema.parse({ fullName, email, password });
  const passwordHash = await passwordHasher(input.password, 12);

  try {
    const user = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(1952532, 1)`;
      const adminRole = await transaction.role.findUnique({ where: { name: 'ADMIN' } });
      if (!adminRole) {
        throw new HttpError(503, 'Administrator roles are not initialized.', 'ROLES_NOT_INITIALIZED');
      }

      const existingAdmin = await transaction.user.findFirst({
        where: { roleId: adminRole.id },
        select: { id: true },
      });
      if (existingAdmin) {
        throw new HttpError(409, 'An administrator already exists.', 'BOOTSTRAP_ALREADY_USED');
      }

      const created = await transaction.user.create({
        data: {
          fullName: input.fullName,
          email: input.email,
          passwordHash,
          status: 'ACTIVE',
          roleId: adminRole.id,
        },
        include: { role: true },
      });

      await transaction.auditLog.create({
        data: {
          actorId: created.id,
          action: 'FIRST_ADMIN_BOOTSTRAP',
          targetType: 'User',
          targetId: created.id,
          result: 'SUCCESS',
          metadata: { source: 'protected_cli' },
        },
      });
      return created;
    }, { isolationLevel: 'Serializable' });

    return serializeUser(user);
  } catch (error) {
    if (error.code === 'P2002') {
      throw new HttpError(409, 'That administrator email is already in use.', 'EMAIL_IN_USE');
    }
    if (error.code === 'P2034') {
      throw new HttpError(409, 'Administrator bootstrap changed concurrently; verify whether an administrator now exists.', 'BOOTSTRAP_CONFLICT');
    }
    throw error;
  }
}
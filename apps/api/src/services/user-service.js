import { HttpError } from '../lib/http-error.js';

function requireDatabase(prisma) {
  if (!prisma) {
    throw new HttpError(503, 'The user service is unavailable.', 'SERVICE_UNAVAILABLE');
  }
}

const safeUserSelect = {
  id: true,
  fullName: true,
  email: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { name: true } },
};

export async function getOwnProfile({ prisma, userId }) {
  requireDatabase(prisma);
  const user = await prisma.user.findUnique({ where: { id: userId, }, select: safeUserSelect });
  if (!user) throw new HttpError(404, 'User not found.', 'USER_NOT_FOUND');
  return { ...user, role: user.role.name };
}

export async function updateOwnProfile({ prisma, userId, fullName }) {
  requireDatabase(prisma);
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.update({
      where: { id: userId },
      data: { fullName },
      select: safeUserSelect,
    });
    await transaction.auditLog.create({
      data: {
        actorId: userId,
        action: 'USER_PROFILE_UPDATED',
        targetType: 'User',
        targetId: userId,
        result: 'SUCCESS',
        metadata: { fields: ['fullName'] },
      },
    });
    return { ...user, role: user.role.name };
  });
}

export async function listUsers({ prisma, query }) {
  requireDatabase(prisma);
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.role ? { role: { name: query.role } } : {}),
    ...(query.search ? {
      OR: [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ],
    } : {}),
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        ...safeUserSelect,
        _count: { select: { accounts: true, onboardingRequests: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { users, total, page: query.page, limit: query.limit };
}

export async function getUserDetails({ prisma, userId }) {
  requireDatabase(prisma);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...safeUserSelect,
      accounts: {
        select: { id: true, type: true, status: true, currency: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
      },
      onboardingRequests: {
        select: { id: true, status: true, submittedAt: true, reviewedAt: true },
        orderBy: { submittedAt: 'desc' },
        take: 20,
      },
    },
  });
  if (!user) throw new HttpError(404, 'User not found.', 'USER_NOT_FOUND');
  return user;
}

export async function updateManagedUser({ prisma, adminId, userId, changes }) {
  requireDatabase(prisma);
  if (adminId === userId && changes.status) {
    throw new HttpError(403, 'Administrators cannot change their own status here.', 'SELF_STATUS_CHANGE_FORBIDDEN');
  }

  return prisma.$transaction(async (transaction) => {
    const current = await transaction.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, roleId: true, role: { select: { name: true } } },
    });
    if (!current) throw new HttpError(404, 'User not found.', 'USER_NOT_FOUND');

    if (current.role.name === 'ADMIN' && current.status === 'ACTIVE' && changes.status === 'SUSPENDED') {
      const activeAdmins = await transaction.user.count({ where: { roleId: current.roleId, status: 'ACTIVE' } });
      if (activeAdmins <= 1) {
        throw new HttpError(409, 'The last active administrator cannot be suspended.', 'LAST_ACTIVE_ADMIN');
      }
    }

    const user = await transaction.user.update({
      where: { id: userId },
      data: changes,
      select: safeUserSelect,
    });
    await transaction.auditLog.create({
      data: {
        actorId: adminId,
        action: 'ADMIN_USER_UPDATED',
        targetType: 'User',
        targetId: userId,
        result: 'SUCCESS',
        metadata: { fields: Object.keys(changes) },
      },
    });
    return user;
  });
}

export async function listAdminAuditLogs({ prisma, query }) {
  requireDatabase(prisma);
  const where = query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {};
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        actorId: true,
        action: true,
        targetType: true,
        targetId: true,
        result: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, fullName: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { logs, total, page: query.page, limit: query.limit };
}
import { HttpError } from '../lib/http-error.js';

const userRequestSelect = {
  id: true,
  status: true,
  phoneNumber: true,
  addressLine: true,
  city: true,
  postalCode: true,
  countryCode: true,
  submittedAt: true,
  reviewedAt: true,
  reviewComment: true,
};

const adminRequestInclude = {
  user: { select: { id: true, fullName: true, email: true } },
  reviewedBy: { select: { id: true, fullName: true } },
};

function requireDatabase(prisma) {
  if (!prisma) {
    throw new HttpError(503, 'The onboarding service is unavailable.', 'SERVICE_UNAVAILABLE');
  }
}

export async function submitOnboarding({ prisma, userId, input }) {
  requireDatabase(prisma);
  try {
    return await prisma.$transaction(async (transaction) => {
      const request = await transaction.onboardingRequest.create({
        data: {
          ...input,
          userId,
          status: 'PENDING',
          activeSubmissionKey: userId,
        },
        select: userRequestSelect,
      });
      await transaction.auditLog.create({
        data: {
          actorId: userId,
          action: 'ONBOARDING_SUBMITTED',
          targetType: 'OnboardingRequest',
          targetId: request.id,
          result: 'SUCCESS',
        },
      });
      return request;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new HttpError(409, 'You already have a pending onboarding request.', 'PENDING_REQUEST_EXISTS');
    }
    throw error;
  }
}

export async function listOwnOnboarding({ prisma, userId }) {
  requireDatabase(prisma);
  return prisma.onboardingRequest.findMany({
    where: { userId },
    orderBy: { submittedAt: 'desc' },
    take: 100,
    select: userRequestSelect,
  });
}

export async function getOwnOnboarding({ prisma, userId, requestId }) {
  requireDatabase(prisma);
  const request = await prisma.onboardingRequest.findFirst({
    where: { id: requestId, userId },
    select: userRequestSelect,
  });
  if (!request) {
    throw new HttpError(404, 'Onboarding request not found.', 'ONBOARDING_NOT_FOUND');
  }
  return request;
}

export async function listAdminOnboarding({ prisma, status }) {
  requireDatabase(prisma);
  return prisma.onboardingRequest.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }],
    take: 100,
    include: adminRequestInclude,
  });
}

export async function getAdminOnboarding({ prisma, requestId }) {
  requireDatabase(prisma);
  const request = await prisma.onboardingRequest.findUnique({
    where: { id: requestId },
    include: adminRequestInclude,
  });
  if (!request) {
    throw new HttpError(404, 'Onboarding request not found.', 'ONBOARDING_NOT_FOUND');
  }
  return request;
}

export async function reviewOnboarding({ prisma, adminId, requestId, status, comment }) {
  requireDatabase(prisma);
  try {
    return await prisma.$transaction(async (transaction) => {
      const current = await transaction.onboardingRequest.findUnique({
        where: { id: requestId },
        select: { id: true, userId: true, status: true },
      });
      if (!current) {
        throw new HttpError(404, 'Onboarding request not found.', 'ONBOARDING_NOT_FOUND');
      }
      if (current.userId === adminId) {
        throw new HttpError(403, 'You cannot review your own onboarding request.', 'SELF_REVIEW_FORBIDDEN');
      }
      if (current.status !== 'PENDING') {
        throw new HttpError(409, 'This onboarding request has already been reviewed.', 'REQUEST_ALREADY_REVIEWED');
      }

      const changed = await transaction.onboardingRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status,
          reviewComment: comment,
          reviewedAt: new Date(),
          reviewedById: adminId,
          activeSubmissionKey: null,
        },
      });
      if (changed.count !== 1) {
        throw new HttpError(409, 'This onboarding request has already been reviewed.', 'REQUEST_ALREADY_REVIEWED');
      }

      const updated = await transaction.onboardingRequest.findUnique({
        where: { id: requestId },
        include: adminRequestInclude,
      });
      const activated = status === 'APPROVED'
        ? await transaction.user.updateMany({
          where: { id: current.userId, status: 'PENDING' },
          data: { status: 'ACTIVE' },
        })
        : { count: 0 };
      await transaction.auditLog.create({
        data: {
          actorId: adminId,
          action: `ONBOARDING_${status}`,
          targetType: 'OnboardingRequest',
          targetId: requestId,
          result: 'SUCCESS',
          metadata: { commentProvided: Boolean(comment), applicantActivated: activated.count === 1 },
        },
      });
      return updated;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error.code === 'P2034') {
      throw new HttpError(409, 'This onboarding request changed during review. Reload and try again.', 'REVIEW_CONFLICT');
    }
    throw error;
  }
}
import { listAdminAuditLogs } from '../services/user-service.js';

export function adminAccess(_request, response) {
  return response.status(200).json({
    success: true,
    data: {
      role: 'ADMIN',
      access: 'granted',
    },
  });
}

export function createAdminAuditController({ prisma }) {
  return async (request, response, next) => {
    try {
      const result = await listAdminAuditLogs({ prisma, query: request.validatedQuery });
      return response.status(200).json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  };
}
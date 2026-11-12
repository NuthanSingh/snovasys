import { getAdminDashboard, getUserDashboard } from '../services/dashboard-service.js';

export function createDashboardController({ prisma }) {
  return {
    user: async (request, response, next) => {
      try {
        const dashboard = await getUserDashboard({ prisma, user: request.auth.user });
        return response.status(200).json({ success: true, data: dashboard });
      } catch (error) {
        return next(error);
      }
    },
    admin: async (_request, response, next) => {
      try {
        const dashboard = await getAdminDashboard({ prisma });
        return response.status(200).json({ success: true, data: dashboard });
      } catch (error) {
        return next(error);
      }
    },
  };
}
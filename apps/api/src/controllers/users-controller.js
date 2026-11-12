import {
  getOwnProfile,
  getUserDetails,
  listUsers,
  updateManagedUser,
  updateOwnProfile,
} from '../services/user-service.js';

export function createUsersController({ prisma }) {
  return {
    getOwn: async (request, response, next) => {
      try {
        const user = await getOwnProfile({ prisma, userId: request.auth.userId });
        return response.status(200).json({ success: true, data: { user } });
      } catch (error) {
        return next(error);
      }
    },
    updateOwn: async (request, response, next) => {
      try {
        const user = await updateOwnProfile({ prisma, userId: request.auth.userId, fullName: request.validatedBody.fullName });
        return response.status(200).json({ success: true, data: { user } });
      } catch (error) {
        return next(error);
      }
    },
    list: async (request, response, next) => {
      try {
        const result = await listUsers({ prisma, query: request.validatedQuery });
        return response.status(200).json({ success: true, data: result });
      } catch (error) {
        return next(error);
      }
    },
    get: async (request, response, next) => {
      try {
        const user = await getUserDetails({ prisma, userId: request.validatedIds.userId });
        return response.status(200).json({ success: true, data: { user } });
      } catch (error) {
        return next(error);
      }
    },
    update: async (request, response, next) => {
      try {
        const user = await updateManagedUser({
          prisma,
          adminId: request.auth.userId,
          userId: request.validatedIds.userId,
          changes: request.validatedBody,
        });
        return response.status(200).json({ success: true, data: { user } });
      } catch (error) {
        return next(error);
      }
    },
  };
}
import {
  createSyntheticAccount,
  getAdminAccount,
  getOwnAccount,
  listAdminAccounts,
  listOwnAccounts,
  updateAccountStatus,
} from '../services/account-service.js';

export function createAccountsController({ prisma }) {
  return {
    listOwn: async (request, response, next) => {
      try {
        const accounts = await listOwnAccounts({ prisma, userId: request.auth.userId });
        return response.status(200).json({ success: true, data: { accounts } });
      } catch (error) {
        return next(error);
      }
    },
    getOwn: async (request, response, next) => {
      try {
        const account = await getOwnAccount({ prisma, userId: request.auth.userId, accountId: request.validatedIds.accountId });
        return response.status(200).json({ success: true, data: { account } });
      } catch (error) {
        return next(error);
      }
    },
    listAdmin: async (request, response, next) => {
      try {
        const result = await listAdminAccounts({ prisma, query: request.validatedQuery });
        return response.status(200).json({ success: true, data: result });
      } catch (error) {
        return next(error);
      }
    },
    getAdmin: async (request, response, next) => {
      try {
        const account = await getAdminAccount({ prisma, accountId: request.validatedIds.accountId });
        return response.status(200).json({ success: true, data: { account } });
      } catch (error) {
        return next(error);
      }
    },
    createForUser: async (request, response, next) => {
      try {
        const account = await createSyntheticAccount({
          prisma,
          adminId: request.auth.userId,
          userId: request.validatedIds.userId,
          type: request.validatedBody.type,
        });
        return response.status(201).json({ success: true, data: { account } });
      } catch (error) {
        return next(error);
      }
    },
    updateStatus: async (request, response, next) => {
      try {
        const account = await updateAccountStatus({
          prisma,
          adminId: request.auth.userId,
          accountId: request.validatedIds.accountId,
          status: request.validatedBody.status,
        });
        return response.status(200).json({ success: true, data: { account } });
      } catch (error) {
        return next(error);
      }
    },
  };
}
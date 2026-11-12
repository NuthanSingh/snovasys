import {
  createSyntheticDeposit,
  listAdminTransactions,
  listOwnAccountTransactions,
  serializeTransaction,
  transferFunds,
} from '../services/ledger-service.js';

export function createLedgerController({ prisma }) {
  return {
    listOwn: async (request, response, next) => {
      try {
        const transactions = await listOwnAccountTransactions({
          prisma,
          userId: request.auth.userId,
          accountId: request.validatedIds.accountId,
        });
        return response.status(200).json({ success: true, data: { transactions } });
      } catch (error) {
        return next(error);
      }
    },
    transfer: async (request, response, next) => {
      try {
        const transaction = await transferFunds({
          prisma,
          actorId: request.auth.userId,
          sourceAccountId: request.validatedIds.accountId,
          destinationAccountId: request.validatedBody.destinationAccountId,
          amount: request.validatedBody.amount,
          description: request.validatedBody.description,
          idempotencyKey: request.idempotencyKey,
        });
        return response.status(201).json({ success: true, data: { transaction: serializeTransaction(transaction) } });
      } catch (error) {
        return next(error);
      }
    },
    deposit: async (request, response, next) => {
      try {
        const transaction = await createSyntheticDeposit({
          prisma,
          actorId: request.auth.userId,
          accountId: request.validatedIds.accountId,
          amount: request.validatedBody.amount,
          description: request.validatedBody.description,
          idempotencyKey: request.idempotencyKey,
        });
        return response.status(201).json({ success: true, data: { transaction: serializeTransaction(transaction) } });
      } catch (error) {
        return next(error);
      }
    },
    listAdmin: async (request, response, next) => {
      try {
        const result = await listAdminTransactions({ prisma, query: request.validatedQuery });
        return response.status(200).json({ success: true, data: result });
      } catch (error) {
        return next(error);
      }
    },
  };
}
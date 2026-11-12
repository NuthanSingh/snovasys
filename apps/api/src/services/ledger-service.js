import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from '../lib/http-error.js';

export function decimalToMinorUnits(value) {
  const normalized = String(value);
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(normalized);
  if (!match) throw new HttpError(400, 'Amount must be a positive decimal with at most four fractional digits.', 'INVALID_AMOUNT');
  return BigInt(match[1]) * 10000n + BigInt((match[2] ?? '').padEnd(4, '0'));
}

export function formatMinorUnits(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 10000n;
  const fraction = String(absolute % 10000n).padStart(4, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function balanceFromGroups(groups, accountId) {
  let balance = 0n;
  for (const group of groups) {
    if (group.accountId !== accountId || !group._sum.amount) continue;
    const amount = decimalToMinorUnits(group._sum.amount);
    balance += group.type === 'CREDIT' ? amount : -amount;
  }
  return formatMinorUnits(balance);
}

export async function accountBalances(prisma, accountIds) {
  if (accountIds.length === 0) return new Map();
  const groups = await prisma.ledgerEntry.groupBy({
    by: ['accountId', 'type'],
    where: { accountId: { in: accountIds } },
    _sum: { amount: true },
  });
  return new Map(accountIds.map((accountId) => [accountId, balanceFromGroups(groups, accountId)]));
}

function normalizedAmount(amount) {
  return formatMinorUnits(decimalToMinorUnits(amount));
}

export function serializeTransaction(transaction) {
  return {
    id: transaction.id,
    referenceId: transaction.referenceId,
    type: transaction.type,
    status: transaction.status,
    amount: String(transaction.amount),
    currency: transaction.currency,
    description: transaction.description,
    actor: transaction.actor ? {
      id: transaction.actor.id,
      fullName: transaction.actor.fullName,
      ...(transaction.actor.email ? { email: transaction.actor.email } : {}),
    } : undefined,
    sourceAccount: transaction.sourceAccount ? {
      id: transaction.sourceAccount.id,
      ...(transaction.sourceAccount.holder ? { holder: { fullName: transaction.sourceAccount.holder.fullName } } : {}),
    } : undefined,
    destinationAccount: transaction.destinationAccount ? {
      id: transaction.destinationAccount.id,
      ...(transaction.destinationAccount.holder ? { holder: { fullName: transaction.destinationAccount.holder.fullName } } : {}),
    } : undefined,
    ledgerEntries: transaction.ledgerEntries?.map((entry) => ({
      id: entry.id,
      accountId: entry.accountId,
      type: entry.type,
      amount: String(entry.amount),
      referenceId: entry.referenceId,
      createdAt: entry.createdAt,
    })),
    createdAt: transaction.createdAt,
  };
}

function hashRequest(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function existingResult(existing, { actorId, requestHash }) {
  if (existing.actorId !== actorId || existing.requestHash !== requestHash) {
    throw new HttpError(409, 'This Idempotency-Key was already used for a different request.', 'IDEMPOTENCY_KEY_REUSED');
  }
  return existing;
}

async function findIdempotentTransaction(prisma, idempotencyKey, expected) {
  const existing = await prisma.ledgerTransaction.findUnique({
    where: { idempotencyKey },
    include: { ledgerEntries: true },
  });
  return existing ? existingResult(existing, expected) : null;
}

async function findIdempotentTransactionIn(transaction, idempotencyKey, expected) {
  const existing = await transaction.ledgerTransaction.findUnique({
    where: { idempotencyKey },
    include: { ledgerEntries: true },
  });
  return existing ? existingResult(existing, expected) : null;
}

async function resolveUniqueRace(prisma, idempotencyKey, expected, error) {
  if (error.code !== 'P2002' && error.code !== 'P2034') throw error;
  const existing = await findIdempotentTransaction(prisma, idempotencyKey, expected);
  if (existing) return existing;
  throw new HttpError(409, 'This transaction conflicted with another operation. Retry with the same Idempotency-Key.', 'TRANSACTION_CONFLICT');
}

function requireDatabase(prisma) {
  if (!prisma) throw new HttpError(503, 'The ledger service is unavailable.', 'SERVICE_UNAVAILABLE');
}

export async function transferFunds({
  prisma,
  actorId,
  sourceAccountId,
  destinationAccountId,
  amount,
  description,
  idempotencyKey,
}) {
  requireDatabase(prisma);
  const normalized = normalizedAmount(amount);
  const units = decimalToMinorUnits(normalized);
  if (sourceAccountId === destinationAccountId) {
    throw new HttpError(400, 'Choose two different accounts for a transfer.', 'SAME_ACCOUNT_TRANSFER');
  }
  const request = { type: 'TRANSFER', sourceAccountId, destinationAccountId, amount: normalized, description };
  const expected = { actorId, requestHash: hashRequest(request) };
  const prior = await findIdempotentTransaction(prisma, idempotencyKey, expected);
  if (prior) return prior;

  try {
    return await prisma.$transaction(async (transaction) => {
      const inTransaction = await findIdempotentTransactionIn(transaction, idempotencyKey, expected);
      if (inTransaction) return inTransaction;

      await transaction.$queryRaw`SELECT "id" FROM "accounts" WHERE "id" IN (${sourceAccountId}::uuid, ${destinationAccountId}::uuid) ORDER BY "id" FOR UPDATE`;
      const accounts = await transaction.account.findMany({
        where: { id: { in: [sourceAccountId, destinationAccountId] } },
        select: { id: true, userId: true, status: true, currency: true },
      });
      const source = accounts.find((account) => account.id === sourceAccountId);
      const destination = accounts.find((account) => account.id === destinationAccountId);
      if (!source || source.userId !== actorId) {
        throw new HttpError(404, 'Source account not found.', 'ACCOUNT_NOT_FOUND');
      }
      if (!destination) throw new HttpError(404, 'Destination account not found.', 'ACCOUNT_NOT_FOUND');
      if (source.status !== 'ACTIVE' || destination.status !== 'ACTIVE') {
        throw new HttpError(409, 'Both accounts must be active to transfer synthetic funds.', 'ACCOUNT_NOT_ACTIVE');
      }
      if (source.currency !== destination.currency) {
        throw new HttpError(409, 'Transfers require accounts with the same currency.', 'CURRENCY_MISMATCH');
      }

      const sourceEntries = await transaction.ledgerEntry.findMany({
        where: { accountId: sourceAccountId },
        select: { type: true, amount: true },
      });
      const sourceBalance = sourceEntries.reduce((balance, entry) => {
        const entryAmount = decimalToMinorUnits(entry.amount);
        return balance + (entry.type === 'CREDIT' ? entryAmount : -entryAmount);
      }, 0n);
      if (sourceBalance < units) {
        throw new HttpError(409, 'Insufficient synthetic balance for this transfer.', 'INSUFFICIENT_BALANCE');
      }

      const referenceId = randomUUID();
      const created = await transaction.ledgerTransaction.create({
        data: {
          referenceId,
          idempotencyKey,
          requestHash: expected.requestHash,
          type: 'TRANSFER',
          status: 'COMPLETED',
          amount: normalized,
          currency: source.currency,
          description,
          actorId,
          sourceAccountId,
          destinationAccountId,
          ledgerEntries: {
            create: [
              { accountId: sourceAccountId, type: 'DEBIT', amount: normalized, referenceId },
              { accountId: destinationAccountId, type: 'CREDIT', amount: normalized, referenceId },
            ],
          },
        },
        include: { ledgerEntries: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: 'SYNTHETIC_TRANSFER_COMPLETED',
          targetType: 'LedgerTransaction',
          targetId: created.id,
          result: 'SUCCESS',
          metadata: { referenceId, sourceAccountId, destinationAccountId, amount: normalized, currency: source.currency },
        },
      });
      return created;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    return resolveUniqueRace(prisma, idempotencyKey, expected, error);
  }
}

export async function createSyntheticDeposit({
  prisma,
  actorId,
  accountId,
  amount,
  description,
  idempotencyKey,
}) {
  requireDatabase(prisma);
  const normalized = normalizedAmount(amount);
  const request = { type: 'DEPOSIT', accountId, amount: normalized, description };
  const expected = { actorId, requestHash: hashRequest(request) };
  const prior = await findIdempotentTransaction(prisma, idempotencyKey, expected);
  if (prior) return prior;

  try {
    return await prisma.$transaction(async (transaction) => {
      const inTransaction = await findIdempotentTransactionIn(transaction, idempotencyKey, expected);
      if (inTransaction) return inTransaction;
      await transaction.$queryRaw`SELECT "id" FROM "accounts" WHERE "id" = ${accountId}::uuid FOR UPDATE`;
      const account = await transaction.account.findUnique({
        where: { id: accountId },
        select: { id: true, status: true, currency: true },
      });
      if (!account) throw new HttpError(404, 'Account not found.', 'ACCOUNT_NOT_FOUND');
      if (account.status !== 'ACTIVE') {
        throw new HttpError(409, 'Only active accounts can receive synthetic deposits.', 'ACCOUNT_NOT_ACTIVE');
      }

      const referenceId = randomUUID();
      const created = await transaction.ledgerTransaction.create({
        data: {
          referenceId,
          idempotencyKey,
          requestHash: expected.requestHash,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          amount: normalized,
          currency: account.currency,
          description,
          actorId,
          destinationAccountId: accountId,
          ledgerEntries: {
            create: [{ accountId, type: 'CREDIT', amount: normalized, referenceId }],
          },
        },
        include: { ledgerEntries: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: 'SYNTHETIC_DEPOSIT_COMPLETED',
          targetType: 'LedgerTransaction',
          targetId: created.id,
          result: 'SUCCESS',
          metadata: { referenceId, accountId, amount: normalized, currency: account.currency, synthetic: true },
        },
      });
      return created;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    return resolveUniqueRace(prisma, idempotencyKey, expected, error);
  }
}

export async function listOwnAccountTransactions({ prisma, userId, accountId }) {
  requireDatabase(prisma);
  const account = await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
  if (!account) throw new HttpError(404, 'Account not found.', 'ACCOUNT_NOT_FOUND');
  const transactions = await prisma.ledgerTransaction.findMany({
    where: { OR: [{ sourceAccountId: accountId }, { destinationAccountId: accountId }] },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return transactions.map((transaction) => ({
    id: transaction.id,
    referenceId: transaction.referenceId,
    type: transaction.type,
    status: transaction.status,
    amount: String(transaction.amount),
    currency: transaction.currency,
    description: transaction.description,
    direction: transaction.destinationAccountId === accountId ? 'CREDIT' : 'DEBIT',
    createdAt: transaction.createdAt,
  }));
}

export async function listAdminTransactions({ prisma, query }) {
  requireDatabase(prisma);
  const searchIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.search ?? '');
  const where = {
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { OR: [
      ...(searchIsUuid ? [{ referenceId: query.search }] : []),
      { description: { contains: query.search, mode: 'insensitive' } },
    ] } : {}),
  };
  const [transactions, total] = await Promise.all([
    prisma.ledgerTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
        sourceAccount: { select: { id: true, holder: { select: { fullName: true } } } },
        destinationAccount: { select: { id: true, holder: { select: { fullName: true } } } },
        ledgerEntries: true,
      },
    }),
    prisma.ledgerTransaction.count({ where }),
  ]);
  return { transactions: transactions.map(serializeTransaction), total, page: query.page, limit: query.limit };
}
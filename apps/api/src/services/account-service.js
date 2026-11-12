import { HttpError } from '../lib/http-error.js';
import { accountBalances, serializeTransaction } from './ledger-service.js';
import { listOwnAccountTransactions } from './ledger-service.js';

function requireDatabase(prisma) {
  if (!prisma) {
    throw new HttpError(503, 'The account service is unavailable.', 'SERVICE_UNAVAILABLE');
  }
}

function serializeLedgerEntry(entry) {
  return { ...entry, amount: String(entry.amount) };
}

export async function listOwnAccounts({ prisma, userId }) {
  requireDatabase(prisma);
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, status: true, currency: true, createdAt: true, updatedAt: true },
  });
  const balances = await accountBalances(prisma, accounts.map((account) => account.id));
  return accounts.map((account) => ({ ...account, balance: balances.get(account.id) ?? '0' }));
}

export async function getOwnAccount({ prisma, userId, accountId }) {
  requireDatabase(prisma);
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: {
      id: true,
      type: true,
      status: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
      ledgerEntries: {
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, type: true, amount: true, referenceId: true, createdAt: true },
      },
    },
  });
  if (!account) throw new HttpError(404, 'Account not found.', 'ACCOUNT_NOT_FOUND');
  const balances = await accountBalances(prisma, [accountId]);
  const transactions = await listOwnAccountTransactions({ prisma, userId, accountId });
  return {
    ...account,
    balance: balances.get(accountId) ?? '0',
    ledgerEntries: account.ledgerEntries.map(serializeLedgerEntry),
    transactions,
  };
}

export async function listAdminAccounts({ prisma, query }) {
  requireDatabase(prisma);
  const searchIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.search ?? '');
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? {
      OR: [
        ...(searchIsUuid ? [{ id: query.search }] : []),
        { holder: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { holder: { email: { contains: query.search, mode: 'insensitive' } } },
      ],
    } : {}),
  };
  const [accounts, total] = await Promise.all([
    prisma.account.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { holder: { select: { id: true, fullName: true, email: true, status: true } } },
    }),
    prisma.account.count({ where }),
  ]);
  const balances = await accountBalances(prisma, accounts.map((account) => account.id));
  return {
    accounts: accounts.map((account) => ({ ...account, balance: balances.get(account.id) ?? '0' })),
    total,
    page: query.page,
    limit: query.limit,
  };
}

export async function getAdminAccount({ prisma, accountId }) {
  requireDatabase(prisma);
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      holder: { select: { id: true, fullName: true, email: true, status: true } },
      ledgerEntries: {
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, type: true, amount: true, referenceId: true, createdAt: true },
      },
    },
  });
  if (!account) throw new HttpError(404, 'Account not found.', 'ACCOUNT_NOT_FOUND');
  const balances = await accountBalances(prisma, [accountId]);
  const transactions = await prisma.ledgerTransaction.findMany({
    where: { OR: [{ sourceAccountId: accountId }, { destinationAccountId: accountId }] },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { actor: { select: { id: true, fullName: true } } },
  });
  return {
    ...account,
    balance: balances.get(accountId) ?? '0',
    ledgerEntries: account.ledgerEntries.map(serializeLedgerEntry),
    transactions: transactions.map(serializeTransaction),
  };
}

export async function createSyntheticAccount({ prisma, adminId, userId, type }) {
  requireDatabase(prisma);
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true, status: true },
    });
    if (!user) throw new HttpError(404, 'User not found.', 'USER_NOT_FOUND');
    if (user.status !== 'ACTIVE') {
      throw new HttpError(409, 'Activate the user before creating a synthetic account.', 'USER_NOT_ACTIVE');
    }

    const account = await transaction.account.create({
      data: { userId, type, status: 'PENDING', currency: 'USD' },
      include: { holder: { select: { id: true, fullName: true, email: true, status: true } } },
    });
    await transaction.auditLog.create({
      data: {
        actorId: adminId,
        action: 'ACCOUNT_CREATED',
        targetType: 'Account',
        targetId: account.id,
        result: 'SUCCESS',
        metadata: { accountType: type, synthetic: true },
      },
    });
    return account;
  });
}

const accountStatusTransitions = {
  PENDING: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['FROZEN', 'CLOSED'],
  FROZEN: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
};

export async function updateAccountStatus({ prisma, adminId, accountId, status }) {
  requireDatabase(prisma);
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.account.findUnique({
      where: { id: accountId },
      select: { id: true, status: true },
    });
    if (!current) throw new HttpError(404, 'Account not found.', 'ACCOUNT_NOT_FOUND');
    if (!accountStatusTransitions[current.status].includes(status)) {
      throw new HttpError(409, `Cannot change an account from ${current.status} to ${status}.`, 'INVALID_ACCOUNT_TRANSITION');
    }

    const account = await transaction.account.update({
      where: { id: accountId },
      data: { status },
      include: { holder: { select: { id: true, fullName: true, email: true, status: true } } },
    });
    await transaction.auditLog.create({
      data: {
        actorId: adminId,
        action: 'ACCOUNT_STATUS_UPDATED',
        targetType: 'Account',
        targetId: accountId,
        result: 'SUCCESS',
        metadata: { from: current.status, to: status },
      },
    });
    return account;
  });
}
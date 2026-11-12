import { HttpError } from '../lib/http-error.js';
import { accountBalances, serializeTransaction } from './ledger-service.js';

function requireDatabase(prisma) {
  if (!prisma) {
    throw new HttpError(503, 'The dashboard service is unavailable.', 'SERVICE_UNAVAILABLE');
  }
}

function serializeLedgerEntry(entry) {
  return {
    id: entry.id,
    type: entry.type,
    amount: String(entry.amount),
    referenceId: entry.referenceId,
    createdAt: entry.createdAt,
    accountId: entry.accountId,
  };
}

export async function getUserDashboard({ prisma, user }) {
  requireDatabase(prisma);
  const [accounts, latestOnboarding] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, status: true, currency: true, createdAt: true },
    }),
    prisma.onboardingRequest.findFirst({
      where: { userId: user.id },
      orderBy: { submittedAt: 'desc' },
      select: { id: true, status: true, submittedAt: true, reviewedAt: true, reviewComment: true },
    }),
  ]);
  const accountIds = accounts.map((account) => account.id);
  const [balances, transactions] = await Promise.all([
    accountBalances(prisma, accountIds),
    accountIds.length ? prisma.ledgerTransaction.findMany({
      where: { OR: [{ sourceAccountId: { in: accountIds } }, { destinationAccountId: { in: accountIds } }] },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }) : [],
  ]);
  const accountSummaries = accounts.map((account) => ({ ...account, balance: balances.get(account.id) ?? '0' }));
  const recentOperations = transactions.map((transaction) => {
    const accountId = accountIds.includes(transaction.sourceAccountId) ? transaction.sourceAccountId : transaction.destinationAccountId;
    return {
      id: transaction.id,
      referenceId: transaction.referenceId,
      type: transaction.type,
      status: transaction.status,
      amount: String(transaction.amount),
      currency: transaction.currency,
      direction: transaction.destinationAccountId === accountId ? 'CREDIT' : 'DEBIT',
      description: transaction.description,
      accountId,
      createdAt: transaction.createdAt,
    };
  });

  return {
    user,
    accounts: accountSummaries,
    accountCount: accounts.length,
    activeAccountCount: accounts.filter((account) => account.status === 'ACTIVE').length,
    onboarding: latestOnboarding,
    recentOperations,
  };
}

export async function getAdminDashboard({ prisma }) {
  requireDatabase(prisma);
  const [totalUsers, activeUsers, approvedUsers, pendingOnboarding, approvedOnboarding, rejectedOnboarding, totalAccounts, frozenAccounts, completedTransactions, completedTransfers, completedDeposits, recentAuditLogs, recentTransactions] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { onboardingRequests: { some: { status: 'APPROVED' } } } }),
    prisma.onboardingRequest.count({ where: { status: 'PENDING' } }),
    prisma.onboardingRequest.count({ where: { status: 'APPROVED' } }),
    prisma.onboardingRequest.count({ where: { status: 'REJECTED' } }),
    prisma.account.count(),
    prisma.account.count({ where: { status: 'FROZEN' } }),
    prisma.ledgerTransaction.count({ where: { status: 'COMPLETED' } }),
    prisma.ledgerTransaction.count({ where: { type: 'TRANSFER', status: 'COMPLETED' } }),
    prisma.ledgerTransaction.count({ where: { type: 'DEPOSIT', status: 'COMPLETED' } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        actorId: true,
        action: true,
        targetType: true,
        targetId: true,
        result: true,
        createdAt: true,
        actor: { select: { fullName: true } },
      },
    }),
    prisma.ledgerTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        actor: { select: { fullName: true } },
        sourceAccount: { select: { id: true } },
        destinationAccount: { select: { id: true } },
      },
    }),
  ]);

  return {
    totalUsers,
    activeUsers,
    approvedUsers,
    pendingOnboarding,
    approvedOnboarding,
    rejectedOnboarding,
    totalAccounts,
    frozenAccounts,
    completedTransactions,
    completedTransfers,
    completedDeposits,
    recentAuditLogs,
    recentTransactions: recentTransactions.map(serializeTransaction),
  };
}
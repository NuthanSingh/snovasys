import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createClient } from 'redis';
import { createApp } from '../src/app.js';
import { SESSION_COOKIE_NAME } from '../src/middleware/authenticate.js';
import { createAuthRateLimiter } from '../src/middleware/auth-rate-limit.js';
import { registerUser } from '../src/services/auth-service.js';
import { createSyntheticDeposit } from '../src/services/ledger-service.js';
import { bootstrapFirstAdmin, BOOTSTRAP_CONFIRMATION } from '../src/services/bootstrap-admin.js';

const configuration = {
  nodeEnv: 'test',
  webOrigin: 'http://web.test',
  jwtSecret: 'test-only-secret-that-is-long-enough-for-hmac-signing',
  jwtExpiresIn: '15m',
  rateLimitWindowMs: 900000,
  rateLimitMax: 10,
};

function createMemoryDependencies() {
  const roles = ['USER', 'ADMIN', 'BOOTSTRAP_ADMIN'].map((name) => ({ id: randomUUID(), name }));
  const state = { users: [], auditLogs: [], onboardingRequests: [], accounts: [], ledgerEntries: [], ledgerTransactions: [] };

  const roleFor = (roleId) => roles.find((role) => role.id === roleId) ?? null;
  const withRole = (user) => (user ? { ...user, role: roleFor(user.roleId) } : null);
  const userFilter = (user, where = {}) => {
    if (where.status && user.status !== where.status) return false;
    if (where.roleId && user.roleId !== where.roleId) return false;
    if (where.role?.name && roleFor(user.roleId)?.name !== where.role.name) return false;
    if (where.onboardingRequests?.some?.status
      && !state.onboardingRequests.some((request) => request.userId === user.id && request.status === where.onboardingRequests.some.status)) return false;
    if (where.OR && !where.OR.some((condition) => {
      const field = Object.keys(condition)[0];
      const needle = condition[field].contains.toLowerCase();
      return String(user[field]).toLowerCase().includes(needle);
    })) return false;
    return true;
  };
  const projectUser = (user, select) => {
    const expanded = withRole(user);
    if (!expanded || !select) return expanded;
    const result = {};
    for (const [field, selection] of Object.entries(select)) {
      if (selection === true) result[field] = expanded[field];
      if (field === 'role' && selection?.select?.name) result.role = { name: expanded.role.name };
      if (field === 'accounts' && selection?.select) {
        result.accounts = state.accounts.filter((account) => account.userId === user.id)
          .map(({ id, type, status, currency, createdAt, updatedAt }) => ({ id, type, status, currency, createdAt, updatedAt }));
      }
      if (field === 'onboardingRequests' && selection?.select) {
        result.onboardingRequests = state.onboardingRequests.filter((request) => request.userId === user.id)
          .slice(0, selection.take ?? 100)
          .map(({ id, status, submittedAt, reviewedAt }) => ({ id, status, submittedAt, reviewedAt }));
      }
      if (field === '_count') {
        result._count = {
          accounts: state.accounts.filter((account) => account.userId === user.id).length,
          onboardingRequests: state.onboardingRequests.filter((request) => request.userId === user.id).length,
        };
      }
    }
    return result;
  };
  const accountFilter = (account, where = {}) => {
    if (typeof where.id === 'string' && account.id !== where.id) return false;
    if (where.id?.in && !where.id.in.includes(account.id)) return false;
    if (where.userId && account.userId !== where.userId) return false;
    if (where.status && account.status !== where.status) return false;
    if (where.OR && !where.OR.some((condition) => {
      const [relation, filter] = Object.entries(condition)[0];
      if (relation === 'id') return account.id.toLowerCase().includes(filter.contains.toLowerCase());
      const holder = state.users.find((user) => user.id === account.userId);
      const field = Object.keys(filter)[0];
      return String(holder?.[field] ?? '').toLowerCase().includes(filter[field].contains.toLowerCase());
    })) return false;
    return true;
  };
  const withAdminRelations = (request) => (request ? {
    ...request,
    user: (() => {
      const user = state.users.find((item) => item.id === request.userId);
      return user ? { id: user.id, fullName: user.fullName, email: user.email } : null;
    })(),
    reviewedBy: (() => {
      const reviewer = state.users.find((item) => item.id === request.reviewedById);
      return reviewer ? { id: reviewer.id, fullName: reviewer.fullName } : null;
    })(),
  } : null);
  const prisma = {
    role: {
      findUnique: async ({ where }) => roles.find((role) => role.name === where.name) ?? null,
    },
    user: {
      findUnique: async ({ where, include, select }) => {
        const user = state.users.find((item) => (where.id ? item.id === where.id : item.email === where.email));
        if (include?.role) return withRole(user);
        return projectUser(user, select);
      },
      findFirst: async ({ where }) => state.users.find((user) => user.roleId === where.roleId) ?? null,
      findMany: async ({ where = {}, select, skip = 0, take = 100 }) => state.users
        .filter((user) => userFilter(user, where))
        .slice(skip, skip + take)
        .map((user) => projectUser(user, select)),
      count: async ({ where = {} } = {}) => state.users.filter((user) => userFilter(user, where)).length,
      create: async ({ data, include }) => {
        if (state.users.some((user) => user.email === data.email)) {
          throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        }
        const user = {
          id: randomUUID(),
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.users.push(user);
        return include?.role ? withRole(user) : user;
      },
      update: async ({ where, data, select }) => {
        const user = state.users.find((item) => item.id === where.id);
        if (!user) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
        Object.assign(user, data, { updatedAt: new Date() });
        return projectUser(user, select);
      },
      updateMany: async ({ where, data }) => {
        const user = state.users.find((item) => item.id === where.id && item.status === where.status);
        if (!user) return { count: 0 };
        Object.assign(user, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
    auditLog: {
      create: async ({ data }) => {
        const log = { id: randomUUID(), createdAt: new Date(), ...data };
        state.auditLogs.push(log);
        return log;
      },
      findMany: async ({ where = {}, skip = 0, take = 100, select }) => state.auditLogs
        .filter((log) => !where.action || log.action.toLowerCase().includes(where.action.contains.toLowerCase()))
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(skip, skip + take)
        .map((log) => {
          const actor = state.users.find((user) => user.id === log.actorId);
          return select ? {
            id: log.id,
            actorId: log.actorId,
            action: log.action,
            targetType: log.targetType,
            targetId: log.targetId,
            result: log.result,
            metadata: log.metadata,
            createdAt: log.createdAt,
            actor: actor ? { id: actor.id, fullName: actor.fullName } : null,
          } : log;
        }),
      count: async ({ where = {} } = {}) => state.auditLogs
        .filter((log) => !where.action || log.action.toLowerCase().includes(where.action.contains.toLowerCase())).length,
    },
    account: {
      findMany: async ({ where = {}, include, select, skip = 0, take = 100 }) => state.accounts
        .filter((account) => accountFilter(account, where))
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(skip, skip + take)
        .map((account) => {
          const ledgerEntries = state.ledgerEntries.filter((entry) => entry.accountId === account.id)
            .slice().sort((left, right) => right.createdAt - left.createdAt);
          const holder = state.users.find((user) => user.id === account.userId);
          if (include?.holder) {
            return { ...account, holder: holder ? { id: holder.id, fullName: holder.fullName, email: holder.email, status: holder.status } : null };
          }
          if (select?.ledgerEntries) {
            return { ...account, ledgerEntries: ledgerEntries.slice(0, select.ledgerEntries.take ?? 100) };
          }
          if (select) return Object.fromEntries(Object.keys(select).filter((key) => select[key] === true).map((key) => [key, account[key]]));
          return account;
        }),
      findFirst: async ({ where, select }) => {
        const account = state.accounts.find((item) => accountFilter(item, where));
        if (!account) return null;
        if (select?.ledgerEntries) {
          return {
            ...account,
            ledgerEntries: state.ledgerEntries.filter((entry) => entry.accountId === account.id)
              .slice().sort((left, right) => right.createdAt - left.createdAt).slice(0, select.ledgerEntries.take ?? 100),
          };
        }
        return account;
      },
      findUnique: async ({ where, include, select }) => {
        const account = state.accounts.find((item) => item.id === where.id);
        if (!account) return null;
        const holder = state.users.find((user) => user.id === account.userId);
        const ledgerEntries = state.ledgerEntries.filter((entry) => entry.accountId === account.id)
          .slice().sort((left, right) => right.createdAt - left.createdAt).slice(0, include?.ledgerEntries?.take ?? 100);
        if (include) {
          return {
            ...account,
            ...(include.holder ? { holder: holder ? { id: holder.id, fullName: holder.fullName, email: holder.email, status: holder.status } : null } : {}),
            ...(include.ledgerEntries ? { ledgerEntries } : {}),
          };
        }
        return select ? Object.fromEntries(Object.keys(select).filter((key) => select[key] === true).map((key) => [key, account[key]])) : account;
      },
      count: async ({ where = {} } = {}) => state.accounts.filter((account) => accountFilter(account, where)).length,
      create: async ({ data, include }) => {
        const account = {
          id: randomUUID(),
          status: 'PENDING',
          currency: 'USD',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.accounts.push(account);
        if (include?.holder) {
          const holder = state.users.find((user) => user.id === account.userId);
          return { ...account, holder: { id: holder.id, fullName: holder.fullName, email: holder.email, status: holder.status } };
        }
        return account;
      },
      update: async ({ where, data, include }) => {
        const account = state.accounts.find((item) => item.id === where.id);
        if (!account) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
        Object.assign(account, data, { updatedAt: new Date() });
        const holder = state.users.find((user) => user.id === account.userId);
        return include?.holder ? { ...account, holder: { id: holder.id, fullName: holder.fullName, email: holder.email, status: holder.status } } : account;
      },
    },
    ledgerEntry: {
      findMany: async ({ where = {}, take = 100 }) => state.ledgerEntries
        .filter((entry) => !where.accountId || (where.accountId.in ? where.accountId.in.includes(entry.accountId) : entry.accountId === where.accountId))
        .slice().sort((left, right) => right.createdAt - left.createdAt).slice(0, take),
      groupBy: async ({ by, where }) => {
        const grouped = new Map();
        for (const entry of state.ledgerEntries.filter((item) => where.accountId.in.includes(item.accountId))) {
          const key = `${entry.accountId}:${entry.type}`;
          const existing = grouped.get(key) ?? { accountId: entry.accountId, type: entry.type, units: 0n };
          const [whole, fraction = ''] = String(entry.amount).split('.');
          existing.units += BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
          grouped.set(key, existing);
        }
        return [...grouped.values()].map(({ accountId, type, units }) => ({
          accountId,
          type,
          _sum: { amount: `${units / 10000n}.${String(units % 10000n).padStart(4, '0')}` },
        }));
      },
    },
    ledgerTransaction: {
      findUnique: async ({ where, include }) => {
        const transaction = state.ledgerTransactions.find((item) => (where.id ? item.id === where.id : item.idempotencyKey === where.idempotencyKey));
        if (!transaction) return null;
        if (include?.ledgerEntries) {
          return { ...transaction, ledgerEntries: state.ledgerEntries.filter((entry) => entry.transactionId === transaction.id) };
        }
        return transaction;
      },
      create: async ({ data, include }) => {
        if (state.ledgerTransactions.some((item) => item.idempotencyKey === data.idempotencyKey)) {
          throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        }
        const { ledgerEntries: nestedEntries, ...transactionData } = data;
        const transaction = { id: randomUUID(), createdAt: new Date(), ...transactionData };
        state.ledgerTransactions.push(transaction);
        const entries = (nestedEntries?.create ?? []).map((entry) => ({
          id: randomUUID(),
          transactionId: transaction.id,
          createdAt: new Date(),
          ...entry,
        }));
        state.ledgerEntries.push(...entries);
        return include?.ledgerEntries ? { ...transaction, ledgerEntries: entries } : transaction;
      },
      findMany: async ({ where = {}, skip = 0, take = 100, include }) => state.ledgerTransactions
        .filter((transaction) => (!where.type || transaction.type === where.type)
          && (!where.status || transaction.status === where.status)
          && (!where.sourceAccountId?.in || where.sourceAccountId.in.includes(transaction.sourceAccountId))
          && (!where.destinationAccountId?.in || where.destinationAccountId.in.includes(transaction.destinationAccountId))
          && (!where.OR || where.OR.some((filter) => {
            const [field, condition] = Object.entries(filter)[0];
            if (condition?.in) return condition.in.includes(transaction[field]);
            if (condition?.contains) return String(transaction[field]).toLowerCase().includes(condition.contains.toLowerCase());
            return transaction[field] === condition;
          })))
        .slice().sort((left, right) => right.createdAt - left.createdAt).slice(skip, skip + take)
        .map((transaction) => ({
          ...transaction,
          ...(include?.ledgerEntries ? { ledgerEntries: state.ledgerEntries.filter((entry) => entry.transactionId === transaction.id) } : {}),
          ...(include?.actor ? { actor: state.users.find((user) => user.id === transaction.actorId) ?? null } : {}),
          ...(include?.sourceAccount ? { sourceAccount: state.accounts.find((account) => account.id === transaction.sourceAccountId) ?? null } : {}),
          ...(include?.destinationAccount ? { destinationAccount: state.accounts.find((account) => account.id === transaction.destinationAccountId) ?? null } : {}),
        })),
      count: async ({ where = {} } = {}) => state.ledgerTransactions.filter((transaction) =>
        (!where.type || transaction.type === where.type) && (!where.status || transaction.status === where.status)).length,
    },
    onboardingRequest: {
      create: async ({ data }) => {
        if (data.activeSubmissionKey && state.onboardingRequests.some((request) => request.activeSubmissionKey === data.activeSubmissionKey)) {
          throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        }
        const request = {
          id: randomUUID(),
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedById: null,
          reviewComment: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.onboardingRequests.push(request);
        return request;
      },
      findMany: async ({ where = {} }) => state.onboardingRequests
        .filter((request) => (!where.userId || request.userId === where.userId)
          && (!where.status || request.status === where.status))
        .map(withAdminRelations),
      count: async ({ where = {} } = {}) => state.onboardingRequests.filter((request) => !where.status || request.status === where.status).length,
      findFirst: async ({ where }) => state.onboardingRequests
        .filter((request) => request.id === where.id && request.userId === where.userId)
        .map(withAdminRelations)[0] ?? null,
      findUnique: async ({ where }) => withAdminRelations(
        state.onboardingRequests.find((request) => request.id === where.id) ?? null,
      ),
      updateMany: async ({ where, data }) => {
        const request = state.onboardingRequests.find((item) => item.id === where.id && item.status === where.status);
        if (!request) {
          return { count: 0 };
        }
        Object.assign(request, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
    $transaction: async (callback) => callback(prisma),
    $queryRaw: async () => [],
  };

  const values = new Map();
  const redisClient = {
    isReady: true,
    ping: async () => 'PONG',
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
      return 'OK';
    },
  };

  return { prisma, redisClient, state, roles };
}

async function startTestServer(t, dependencies = createMemoryDependencies()) {
  const appOptions = {
    ...dependencies,
    configuration,
    passwordHasher: (password) => bcrypt.hash(password, 4),
  };
  if (!Object.hasOwn(dependencies, 'authRateLimiter')) {
    appOptions.authRateLimiter = (_request, _response, next) => next();
  }
  const app = createApp(appOptions);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  return { origin: `http://127.0.0.1:${server.address().port}`, ...dependencies };
}

async function send(origin, path, { method = 'GET', body, cookie, headers = {} } = {}) {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      origin: configuration.webOrigin,
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function sessionCookie(response) {
  const header = response.headers.get('set-cookie');
  assert.ok(header, 'expected an HttpOnly session cookie');
  return header.split(';', 1)[0];
}

const registration = {
  fullName: 'Synthetic Demo User',
  email: 'Demo.User@example.test',
  password: 'a-long-test-password-2026',
};

const onboardingDetails = {
  phoneNumber: '+14155550123',
  addressLine: '123 Synthetic Demo Street',
  city: 'San Francisco',
  postalCode: '94105',
  countryCode: 'us',
};

test('registers a USER with a password hash and safe response', async (t) => {
  const harness = await startTestServer(t);
  const response = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.data.user.email, 'demo.user@example.test');
  assert.equal(payload.data.user.role, 'USER');
  assert.equal('passwordHash' in payload.data.user, false);
  assert.equal(await bcrypt.compare(registration.password, harness.state.users[0].passwordHash), true);
  assert.equal(harness.state.auditLogs[0].action, 'USER_REGISTERED');
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
});

test('uses bcrypt cost factor 12 in the production registration service', async () => {
  const { prisma } = createMemoryDependencies();
  const user = await registerUser({
    prisma,
    input: {
      fullName: registration.fullName,
      email: 'cost-factor@example.test',
      password: registration.password,
    },
  });

  assert.match(user.passwordHash, /^\$2[aby]\$12\$/);
  assert.notEqual(user.passwordHash, registration.password);
});

test('rejects duplicate registration', async (t) => {
  const harness = await startTestServer(t);
  await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const response = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });

  assert.equal(response.status, 409);
  assert.equal(harness.state.users.length, 1);
});

test('logs in and returns a safe profile without returning the JWT in JSON', async (t) => {
  const harness = await startTestServer(t);
  await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const response = await send(harness.origin, '/api/auth/login', {
    method: 'POST',
    body: { email: registration.email, password: registration.password },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.user.role, 'USER');
  assert.equal('token' in payload.data, false);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
});

test('returns the same invalid-credentials error for an incorrect password', async (t) => {
  const harness = await startTestServer(t);
  await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const response = await send(harness.origin, '/api/auth/login', {
    method: 'POST',
    body: { email: registration.email, password: 'incorrect-password' },
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.error.message, 'Invalid email or password.');
  assert.equal(harness.state.auditLogs.at(-1).metadata.reason, 'invalid_credentials');
});

test('rejects invalid and expired JWT cookies', async (t) => {
  const harness = await startTestServer(t);
  const invalid = await send(harness.origin, '/api/auth/me', { cookie: `${SESSION_COOKIE_NAME}=not-a-jwt` });
  assert.equal(invalid.status, 401);

  const user = await harness.prisma.user.create({
    data: {
      fullName: registration.fullName,
      email: 'expired@example.test',
      passwordHash: await bcrypt.hash(registration.password, 4),
      roleId: harness.roles.find((role) => role.name === 'USER').id,
    },
    include: { role: true },
  });
  const expired = jwt.sign({ jti: randomUUID() }, configuration.jwtSecret, {
    subject: user.id,
    issuer: 'balancevault-api',
    audience: 'balancevault-web',
    expiresIn: -1,
  });
  const expiredResponse = await send(harness.origin, '/api/auth/me', {
    cookie: `${SESSION_COOKIE_NAME}=${expired}`,
  });
  assert.equal(expiredResponse.status, 401);

  const wrongAlgorithm = jwt.sign({ jti: randomUUID() }, configuration.jwtSecret, {
    algorithm: 'HS384',
    subject: user.id,
    issuer: 'balancevault-api',
    audience: 'balancevault-web',
    expiresIn: '15m',
  });
  const wrongAlgorithmResponse = await send(harness.origin, '/api/auth/me', {
    cookie: `${SESSION_COOKIE_NAME}=${wrongAlgorithm}`,
  });
  assert.equal(wrongAlgorithmResponse.status, 401);
});

test('health is live while readiness requires PostgreSQL and Redis', async (t) => {
  const dependencies = createMemoryDependencies();
  const harness = await startTestServer(t, { ...dependencies, prisma: null, redisClient: null });
  const health = await send(harness.origin, '/health');
  const readiness = await send(harness.origin, '/ready');
  const payload = await readiness.json();

  assert.equal(health.status, 200);
  assert.equal(readiness.status, 503);
  assert.equal(payload.data.dependencies.postgres, 'unavailable');
  assert.equal(payload.data.dependencies.redis, 'unavailable');
});

test('returns only the authenticated user profile from /me', async (t) => {
  const harness = await startTestServer(t);
  const registered = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const response = await send(harness.origin, '/api/auth/me', { cookie: sessionCookie(registered) });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.user.email, 'demo.user@example.test');
  assert.equal('passwordHash' in payload.data.user, false);
});

test('denies a normal user access to the admin API', async (t) => {
  const harness = await startTestServer(t);
  const registered = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const response = await send(harness.origin, '/api/admin/access', { cookie: sessionCookie(registered) });

  assert.equal(response.status, 403);
});

test('allows an ADMIN and denies a BOOTSTRAP_ADMIN on admin APIs', async (t) => {
  const harness = await startTestServer(t);
  const admin = await bootstrapFirstAdmin({
    prisma: harness.prisma,
    fullName: 'Synthetic Demo Admin',
    email: 'admin@example.test',
    password: 'a-long-admin-test-password',
    confirmation: BOOTSTRAP_CONFIRMATION,
    passwordHasher: (password) => bcrypt.hash(password, 4),
  });
  assert.equal(admin.role, 'ADMIN');

  const adminLogin = await send(harness.origin, '/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@example.test', password: 'a-long-admin-test-password' },
  });
  const allowed = await send(harness.origin, '/api/admin/access', { cookie: sessionCookie(adminLogin) });
  assert.equal(allowed.status, 200);

  const bootstrapRole = harness.roles.find((role) => role.name === 'BOOTSTRAP_ADMIN');
  await harness.prisma.user.create({
    data: {
      fullName: 'Restricted Bootstrap Operator',
      email: 'bootstrap@example.test',
      passwordHash: await bcrypt.hash(registration.password, 4),
      status: 'ACTIVE',
      roleId: bootstrapRole.id,
    },
    include: { role: true },
  });
  const bootstrapLogin = await send(harness.origin, '/api/auth/login', {
    method: 'POST',
    body: { email: 'bootstrap@example.test', password: registration.password },
  });
  const denied = await send(harness.origin, '/api/admin/access', { cookie: sessionCookie(bootstrapLogin) });
  assert.equal(denied.status, 403);
});

test('creates and audits only the first administrator, then rejects repeats', async () => {
  const { prisma, state } = createMemoryDependencies();
  const input = {
    prisma,
    fullName: 'Synthetic Demo Admin',
    email: 'admin@example.test',
    password: 'a-long-admin-test-password',
    confirmation: BOOTSTRAP_CONFIRMATION,
    passwordHasher: (password) => bcrypt.hash(password, 4),
  };
  const admin = await bootstrapFirstAdmin(input);

  assert.equal(admin.role, 'ADMIN');
  assert.equal(state.auditLogs[0].action, 'FIRST_ADMIN_BOOTSTRAP');
  await assert.rejects(bootstrapFirstAdmin(input), { code: 'BOOTSTRAP_ALREADY_USED' });
  assert.equal(state.users.length, 1);
});

test('requires explicit bootstrap confirmation', async () => {
  const { prisma, state } = createMemoryDependencies();
  await assert.rejects(bootstrapFirstAdmin({
    prisma,
    fullName: 'Synthetic Demo Admin',
    email: 'admin@example.test',
    password: 'a-long-admin-test-password',
    confirmation: '',
    passwordHasher: (password) => bcrypt.hash(password, 4),
  }), { code: 'BOOTSTRAP_CONFIRMATION_REQUIRED' });
  assert.equal(state.users.length, 0);
});

test('rejects role fields during public registration', async (t) => {
  const harness = await startTestServer(t);
  const response = await send(harness.origin, '/api/auth/register', {
    method: 'POST',
    body: { ...registration, role: 'ADMIN' },
  });

  assert.equal(response.status, 400);
  assert.equal(harness.state.users.length, 0);
});

test('logout revokes the current session', async (t) => {
  const harness = await startTestServer(t);
  const registered = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const cookie = sessionCookie(registered);
  const logout = await send(harness.origin, '/api/auth/logout', { method: 'POST', cookie });
  assert.equal(logout.status, 200);
  assert.equal(harness.state.auditLogs.at(-1).action, 'AUTH_LOGOUT');
  assert.equal('tokenId' in harness.state.auditLogs.at(-1), false);

  const afterLogout = await send(harness.origin, '/api/auth/me', { cookie });
  assert.equal(afterLogout.status, 401);
});

test('fails closed when Redis-backed rate limiting is unavailable', async (t) => {
  const dependencies = createMemoryDependencies();
  const { origin } = await startTestServer(t, { ...dependencies, redisClient: null, authRateLimiter: undefined });
  const response = await send(origin, '/api/auth/login', {
    method: 'POST',
    body: { email: registration.email, password: registration.password },
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.error.message, 'Authentication rate limiting is unavailable.');
});

test('submits onboarding details, displays status, and audits submission', async (t) => {
  const harness = await startTestServer(t);
  const registered = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const cookie = sessionCookie(registered);
  const submitted = await send(harness.origin, '/api/onboarding', {
    method: 'POST',
    cookie,
    body: onboardingDetails,
  });
  const payload = await submitted.json();
  assert.equal(submitted.status, 201);
  assert.equal(payload.data.request.status, 'PENDING');
  assert.equal(payload.data.request.countryCode, 'US');
  assert.ok(payload.data.request.submittedAt);
  assert.equal(harness.state.auditLogs.at(-1).action, 'ONBOARDING_SUBMITTED');

  const history = await send(harness.origin, '/api/onboarding/me', { cookie });
  const historyPayload = await history.json();
  assert.equal(history.status, 200);
  assert.equal(historyPayload.data.requests.length, 1);
  assert.equal(historyPayload.data.requests[0].id, payload.data.request.id);
});

test('rejects invalid onboarding details and duplicate pending requests', async (t) => {
  const harness = await startTestServer(t);
  const registered = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const cookie = sessionCookie(registered);
  const invalid = await send(harness.origin, '/api/onboarding', {
    method: 'POST',
    cookie,
    body: { ...onboardingDetails, phoneNumber: 'not-a-phone' },
  });
  assert.equal(invalid.status, 400);

  const first = await send(harness.origin, '/api/onboarding', { method: 'POST', cookie, body: onboardingDetails });
  const duplicate = await send(harness.origin, '/api/onboarding', { method: 'POST', cookie, body: onboardingDetails });
  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 409);
});

test('requires authentication and scopes request history and details to their owner', async (t) => {
  const harness = await startTestServer(t);
  const anonymous = await send(harness.origin, '/api/onboarding', { method: 'POST', body: onboardingDetails });
  assert.equal(anonymous.status, 401);

  const firstRegistration = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const firstCookie = sessionCookie(firstRegistration);
  const submitted = await send(harness.origin, '/api/onboarding', {
    method: 'POST', cookie: firstCookie, body: onboardingDetails,
  });
  const requestId = (await submitted.json()).data.request.id;

  const secondRegistration = await send(harness.origin, '/api/auth/register', {
    method: 'POST',
    body: { ...registration, email: 'other@example.test' },
  });
  const secondCookie = sessionCookie(secondRegistration);
  const secondHistory = await send(harness.origin, '/api/onboarding/me', { cookie: secondCookie });
  assert.equal((await secondHistory.json()).data.requests.length, 0);
  const stolenDetails = await send(harness.origin, `/api/onboarding/${requestId}`, { cookie: secondCookie });
  assert.equal(stolenDetails.status, 404);
  const ownerDetails = await send(harness.origin, `/api/onboarding/${requestId}`, { cookie: firstCookie });
  assert.equal(ownerDetails.status, 200);
});

test('ADMIN can list and inspect requests while USER and BOOTSTRAP_ADMIN cannot', async (t) => {
  const harness = await startTestServer(t);
  const userRegistration = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const userCookie = sessionCookie(userRegistration);
  const submitted = await send(harness.origin, '/api/onboarding', {
    method: 'POST', cookie: userCookie, body: onboardingDetails,
  });
  const requestId = (await submitted.json()).data.request.id;
  assert.equal((await send(harness.origin, '/api/admin/onboarding', { cookie: userCookie })).status, 403);
  const unauthorizedReview = await send(harness.origin, `/api/admin/onboarding/${requestId}/review`, {
    method: 'PUT',
    cookie: userCookie,
    body: { status: 'APPROVED' },
  });
  assert.equal(unauthorizedReview.status, 403);

  const { prisma } = harness;
  const admin = await bootstrapFirstAdmin({
    prisma,
    fullName: 'Synthetic Review Admin',
    email: 'review-admin@example.test',
    password: 'a-long-review-admin-password',
    confirmation: BOOTSTRAP_CONFIRMATION,
    passwordHasher: (password) => bcrypt.hash(password, 4),
  });
  const adminLogin = await send(harness.origin, '/api/auth/login', {
    method: 'POST',
    body: { email: admin.email, password: 'a-long-review-admin-password' },
  });
  const adminCookie = sessionCookie(adminLogin);
  const list = await send(harness.origin, '/api/admin/onboarding?status=PENDING', { cookie: adminCookie });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).data.requests.length, 1);
  const detail = await send(harness.origin, `/api/admin/onboarding/${requestId}`, { cookie: adminCookie });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).data.request.user.email, 'demo.user@example.test');

  const bootstrapRole = harness.roles.find((role) => role.name === 'BOOTSTRAP_ADMIN');
  const bootstrap = await prisma.user.create({
    data: {
      fullName: 'Restricted Operator',
      email: 'restricted@example.test',
      passwordHash: await bcrypt.hash(registration.password, 4),
      status: 'ACTIVE',
      roleId: bootstrapRole.id,
    },
    include: { role: true },
  });
  const bootstrapLogin = await send(harness.origin, '/api/auth/login', {
    method: 'POST',
    body: { email: bootstrap.email, password: registration.password },
  });
  assert.equal((await send(harness.origin, '/api/admin/onboarding', {
    cookie: sessionCookie(bootstrapLogin),
  })).status, 403);
});

test('ADMIN approval and rejection are audited and cannot self-review', async (t) => {
  const harness = await startTestServer(t);
  const admin = await bootstrapFirstAdmin({
    prisma: harness.prisma,
    fullName: 'Synthetic Review Admin',
    email: 'review-admin@example.test',
    password: 'a-long-review-admin-password',
    confirmation: BOOTSTRAP_CONFIRMATION,
    passwordHasher: (password) => bcrypt.hash(password, 4),
  });
  const adminLogin = await send(harness.origin, '/api/auth/login', {
    method: 'POST',
    body: { email: admin.email, password: 'a-long-review-admin-password' },
  });
  const adminCookie = sessionCookie(adminLogin);

  const ownerLogin = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const ownerCookie = sessionCookie(ownerLogin);
  const submitted = await send(harness.origin, '/api/onboarding', {
    method: 'POST', cookie: ownerCookie, body: onboardingDetails,
  });
  const approvedId = (await submitted.json()).data.request.id;

  const approved = await send(harness.origin, `/api/admin/onboarding/${approvedId}/review`, {
    method: 'PUT', cookie: adminCookie, body: { status: 'APPROVED', comment: 'Synthetic data verified.' },
  });
  assert.equal(approved.status, 200);
  const approvedPayload = await approved.json();
  assert.equal(approvedPayload.data.request.status, 'APPROVED');
  assert.equal(approvedPayload.data.request.reviewComment, 'Synthetic data verified.');
  assert.equal(harness.state.users.find((user) => user.id === approvedPayload.data.request.userId)?.status, 'ACTIVE');
  assert.equal(harness.state.auditLogs.at(-1).action, 'ONBOARDING_APPROVED');
  assert.equal(harness.state.auditLogs.at(-1).actorId, admin.id);
  assert.equal(harness.state.auditLogs.at(-1).metadata.applicantActivated, true);

  const repeatedReview = await send(harness.origin, `/api/admin/onboarding/${approvedId}/review`, {
    method: 'PUT', cookie: adminCookie, body: { status: 'REJECTED' },
  });
  assert.equal(repeatedReview.status, 409);

  const rejectedOwner = await send(harness.origin, '/api/auth/register', {
    method: 'POST', body: { ...registration, email: 'rejected@example.test' },
  });
  const rejectedSubmission = await send(harness.origin, '/api/onboarding', {
    method: 'POST', cookie: sessionCookie(rejectedOwner), body: onboardingDetails,
  });
  const rejectedId = (await rejectedSubmission.json()).data.request.id;
  const rejected = await send(harness.origin, `/api/admin/onboarding/${rejectedId}/review`, {
    method: 'PUT', cookie: adminCookie, body: { status: 'REJECTED' },
  });
  assert.equal(rejected.status, 200);
  const rejectedPayload = await rejected.json();
  assert.equal(rejectedPayload.data.request.status, 'REJECTED');
  assert.equal(harness.state.users.find((user) => user.id === rejectedPayload.data.request.userId)?.status, 'PENDING');
  assert.equal(harness.state.auditLogs.at(-1).action, 'ONBOARDING_REJECTED');
  assert.equal(harness.state.auditLogs.at(-1).metadata.applicantActivated, false);

  const suspendedOwner = await send(harness.origin, '/api/auth/register', {
    method: 'POST', body: { ...registration, email: 'suspended@example.test' },
  });
  const suspendedSubmission = await send(harness.origin, '/api/onboarding', {
    method: 'POST', cookie: sessionCookie(suspendedOwner), body: onboardingDetails,
  });
  const suspendedRequest = (await suspendedSubmission.json()).data.request;
  harness.state.users.find((user) => user.id === suspendedRequest.userId).status = 'SUSPENDED';
  const suspendedApproval = await send(harness.origin, `/api/admin/onboarding/${suspendedRequest.id}/review`, {
    method: 'PUT', cookie: adminCookie, body: { status: 'APPROVED' },
  });
  assert.equal(suspendedApproval.status, 200);
  assert.equal(harness.state.users.find((user) => user.id === suspendedRequest.userId)?.status, 'SUSPENDED');
  assert.equal(harness.state.auditLogs.at(-1).metadata.applicantActivated, false);

  const approvedQueue = await send(harness.origin, '/api/admin/onboarding?status=APPROVED', { cookie: adminCookie });
  const rejectedQueue = await send(harness.origin, '/api/admin/onboarding?status=REJECTED', { cookie: adminCookie });
  assert.equal((await approvedQueue.json()).data.requests.length, 2);
  assert.equal((await rejectedQueue.json()).data.requests.length, 1);

  const selfSubmission = await send(harness.origin, '/api/onboarding', {
    method: 'POST', cookie: adminCookie, body: onboardingDetails,
  });
  const selfRequestId = (await selfSubmission.json()).data.request.id;
  const selfReview = await send(harness.origin, `/api/admin/onboarding/${selfRequestId}/review`, {
    method: 'PUT', cookie: adminCookie, body: { status: 'APPROVED' },
  });
  assert.equal(selfReview.status, 403);
});

test('user dashboard and account APIs return only the signed-in user records', async (t) => {
  const harness = await startTestServer(t);
  const firstLogin = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const firstCookie = sessionCookie(firstLogin);
  const secondLogin = await send(harness.origin, '/api/auth/register', {
    method: 'POST', body: { ...registration, email: 'account-owner-two@example.test' },
  });
  const firstUser = harness.state.users.find((user) => user.email === 'demo.user@example.test');
  const secondUser = harness.state.users.find((user) => user.email === 'account-owner-two@example.test');
  const firstAccount = await harness.prisma.account.create({ data: { userId: firstUser.id, type: 'CHECKING' } });
  await harness.prisma.account.create({ data: { userId: secondUser.id, type: 'SAVINGS' } });
  const depositId = randomUUID();
  const depositReference = randomUUID();
  const depositTime = new Date();
  harness.state.ledgerTransactions.push({
    id: depositId,
    referenceId: depositReference,
    type: 'DEPOSIT',
    status: 'COMPLETED',
    amount: '25.5000',
    currency: 'USD',
    description: 'Synthetic test deposit',
    actorId: firstUser.id,
    sourceAccountId: null,
    destinationAccountId: firstAccount.id,
    createdAt: depositTime,
  });
  harness.state.ledgerEntries.push({
    id: randomUUID(), transactionId: depositId, accountId: firstAccount.id, type: 'CREDIT', amount: '25.5000',
    referenceId: depositReference, createdAt: depositTime,
  });

  const dashboard = await send(harness.origin, '/api/dashboard/me', { cookie: firstCookie });
  const dashboardPayload = await dashboard.json();
  assert.equal(dashboard.status, 200);
  assert.equal(dashboardPayload.data.accountCount, 1);
  assert.equal(dashboardPayload.data.recentOperations[0].amount, '25.5000');
  assert.equal(dashboardPayload.data.recentOperations[0].accountId, firstAccount.id);

  const ownAccounts = await send(harness.origin, '/api/accounts', { cookie: firstCookie });
  assert.equal((await ownAccounts.json()).data.accounts.length, 1);
  const ownDetail = await send(harness.origin, `/api/accounts/${firstAccount.id}`, { cookie: firstCookie });
  assert.equal(ownDetail.status, 200);
  assert.equal((await ownDetail.json()).data.account.ledgerEntries.length, 1);
  const otherDetail = await send(harness.origin, `/api/accounts/${firstAccount.id}`, { cookie: sessionCookie(secondLogin) });
  assert.equal(otherDetail.status, 404);
});

test('user profile can update its name but cannot update its role', async (t) => {
  const harness = await startTestServer(t);
  const registered = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const cookie = sessionCookie(registered);
  const escalation = await send(harness.origin, '/api/users/me', {
    method: 'PUT', cookie, body: { fullName: 'Changed Name', role: 'ADMIN' },
  });
  assert.equal(escalation.status, 400);

  const update = await send(harness.origin, '/api/users/me', {
    method: 'PUT', cookie, body: { fullName: 'Updated Demo Name' },
  });
  const payload = await update.json();
  assert.equal(update.status, 200);
  assert.equal(payload.data.user.fullName, 'Updated Demo Name');
  assert.equal(payload.data.user.role, 'USER');
  assert.equal('passwordHash' in payload.data.user, false);
  assert.equal(harness.state.auditLogs.at(-1).action, 'USER_PROFILE_UPDATED');
});

test('admin dashboard and user management provide real counts, filters, and safe updates', async (t) => {
  const harness = await startTestServer(t);
  const admin = await bootstrapFirstAdmin({
    prisma: harness.prisma,
    fullName: 'Synthetic Stage Six Admin',
    email: 'stage-six-admin@example.test',
    password: 'a-long-stage-six-admin-password',
    confirmation: BOOTSTRAP_CONFIRMATION,
    passwordHasher: (password) => bcrypt.hash(password, 4),
  });
  const adminLogin = await send(harness.origin, '/api/auth/login', {
    method: 'POST', body: { email: admin.email, password: 'a-long-stage-six-admin-password' },
  });
  const adminCookie = sessionCookie(adminLogin);
  const userLogin = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const user = harness.state.users.find((item) => item.email === 'demo.user@example.test');

  const activated = await send(harness.origin, `/api/admin/users/${user.id}`, {
    method: 'PUT', cookie: adminCookie, body: { status: 'ACTIVE' },
  });
  assert.equal(activated.status, 200);
  assert.equal((await activated.json()).data.user.status, 'ACTIVE');
  harness.state.onboardingRequests.push({ id: randomUUID(), userId: user.id, status: 'APPROVED', submittedAt: new Date() });

  const filtered = await send(harness.origin, '/api/admin/users?search=demo.user&role=USER&status=ACTIVE', { cookie: adminCookie });
  const filteredPayload = await filtered.json();
  assert.equal(filtered.status, 200);
  assert.equal(filteredPayload.data.total, 1);
  assert.equal(filteredPayload.data.users[0].email, 'demo.user@example.test');
  assert.equal('passwordHash' in filteredPayload.data.users[0], false);
  const detail = await send(harness.origin, `/api/admin/users/${user.id}`, { cookie: adminCookie });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).data.user.id, user.id);

  const roleChange = await send(harness.origin, `/api/admin/users/${user.id}`, {
    method: 'PUT', cookie: adminCookie, body: { role: 'ADMIN' },
  });
  assert.equal(roleChange.status, 400);
  const ownDeactivation = await send(harness.origin, `/api/admin/users/${admin.id}`, {
    method: 'PUT', cookie: adminCookie, body: { status: 'SUSPENDED' },
  });
  assert.equal(ownDeactivation.status, 403);

  const dashboard = await send(harness.origin, '/api/admin/dashboard', { cookie: adminCookie });
  const dashboardPayload = await dashboard.json();
  assert.equal(dashboard.status, 200);
  assert.equal(dashboardPayload.data.totalUsers, 2);
  assert.equal(dashboardPayload.data.activeUsers, 2);
  assert.equal(dashboardPayload.data.approvedUsers, 1);
  assert.ok(dashboardPayload.data.recentAuditLogs.length > 0);
  assert.equal((await send(harness.origin, '/api/admin/dashboard', { cookie: sessionCookie(userLogin) })).status, 403);
});

test('admin account creation, status changes, filtering, and audit logs are protected', async (t) => {
  const harness = await startTestServer(t);
  const admin = await bootstrapFirstAdmin({
    prisma: harness.prisma,
    fullName: 'Synthetic Account Admin',
    email: 'account-admin@example.test',
    password: 'a-long-account-admin-password',
    confirmation: BOOTSTRAP_CONFIRMATION,
    passwordHasher: (password) => bcrypt.hash(password, 4),
  });
  const adminLogin = await send(harness.origin, '/api/auth/login', {
    method: 'POST', body: { email: admin.email, password: 'a-long-account-admin-password' },
  });
  const adminCookie = sessionCookie(adminLogin);
  const ownerLogin = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const ownerCookie = sessionCookie(ownerLogin);
  const owner = harness.state.users.find((user) => user.email === 'demo.user@example.test');

  await send(harness.origin, `/api/admin/users/${owner.id}`, {
    method: 'PUT', cookie: adminCookie, body: { status: 'ACTIVE' },
  });
  const created = await send(harness.origin, `/api/admin/users/${owner.id}/accounts`, {
    method: 'POST', cookie: adminCookie, body: { type: 'CHECKING' },
  });
  assert.equal(created.status, 201);
  const account = (await created.json()).data.account;
  assert.equal(account.status, 'PENDING');
  assert.equal(account.holder.id, owner.id);
  assert.equal((await send(harness.origin, '/api/accounts', { cookie: ownerCookie })).status, 200);

  const activated = await send(harness.origin, `/api/admin/accounts/${account.id}/status`, {
    method: 'PUT', cookie: adminCookie, body: { status: 'ACTIVE' },
  });
  assert.equal(activated.status, 200);
  assert.equal((await activated.json()).data.account.status, 'ACTIVE');
  const list = await send(harness.origin, '/api/admin/accounts?status=ACTIVE&search=demo.user', { cookie: adminCookie });
  assert.equal((await list.json()).data.total, 1);
  const detail = await send(harness.origin, `/api/admin/accounts/${account.id}`, { cookie: adminCookie });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).data.account.holder.email, 'demo.user@example.test');

  const forbidden = await send(harness.origin, '/api/admin/accounts', { cookie: ownerCookie });
  assert.equal(forbidden.status, 403);
  const audit = await send(harness.origin, '/api/admin/audit-logs?action=ACCOUNT', { cookie: adminCookie });
  const auditPayload = await audit.json();
  assert.equal(audit.status, 200);
  assert.ok(auditPayload.data.logs.some((log) => log.action === 'ACCOUNT_CREATED'));
  assert.ok(auditPayload.data.logs.some((log) => log.action === 'ACCOUNT_STATUS_UPDATED'));
});

test('synthetic deposits and transfers are idempotent, double-entry, precise, and owner-checked', async (t) => {
  const harness = await startTestServer(t);
  const admin = await bootstrapFirstAdmin({
    prisma: harness.prisma,
    fullName: 'Synthetic Ledger Admin',
    email: 'ledger-admin@example.test',
    password: 'a-long-ledger-admin-password',
    confirmation: BOOTSTRAP_CONFIRMATION,
    passwordHasher: (password) => bcrypt.hash(password, 4),
  });
  const adminLogin = await send(harness.origin, '/api/auth/login', {
    method: 'POST', body: { email: admin.email, password: 'a-long-ledger-admin-password' },
  });
  const adminCookie = sessionCookie(adminLogin);
  const ownerLogin = await send(harness.origin, '/api/auth/register', { method: 'POST', body: registration });
  const otherLogin = await send(harness.origin, '/api/auth/register', {
    method: 'POST', body: { ...registration, email: 'ledger-other@example.test' },
  });
  const owner = harness.state.users.find((user) => user.email === 'demo.user@example.test');
  const other = harness.state.users.find((user) => user.email === 'ledger-other@example.test');

  await send(harness.origin, `/api/admin/users/${owner.id}`, { method: 'PUT', cookie: adminCookie, body: { status: 'ACTIVE' } });
  await send(harness.origin, `/api/admin/users/${other.id}`, { method: 'PUT', cookie: adminCookie, body: { status: 'ACTIVE' } });
  const sourceAccount = (await (await send(harness.origin, `/api/admin/users/${owner.id}/accounts`, {
    method: 'POST', cookie: adminCookie, body: { type: 'CHECKING' },
  })).json()).data.account;
  const destinationAccount = (await (await send(harness.origin, `/api/admin/users/${other.id}/accounts`, {
    method: 'POST', cookie: adminCookie, body: { type: 'SAVINGS' },
  })).json()).data.account;
  for (const account of [sourceAccount, destinationAccount]) {
    await send(harness.origin, `/api/admin/accounts/${account.id}/status`, {
      method: 'PUT', cookie: adminCookie, body: { status: 'ACTIVE' },
    });
  }

  const depositKey = 'stage-seven-deposit-0001';
  const deposit = await send(harness.origin, `/api/admin/accounts/${sourceAccount.id}/deposits`, {
    method: 'POST', cookie: adminCookie, headers: { 'idempotency-key': depositKey },
    body: { amount: '100.0000', description: 'Synthetic test funding' },
  });
  assert.equal(deposit.status, 201);
  const depositTransaction = (await deposit.json()).data.transaction;
  assert.equal(depositTransaction.status, 'COMPLETED');
  assert.equal(depositTransaction.ledgerEntries.length, 1);
  assert.equal(depositTransaction.ledgerEntries[0].type, 'CREDIT');
  assert.equal('idempotencyKey' in depositTransaction, false);
  assert.equal('requestHash' in depositTransaction, false);
  const repeatedDeposit = await send(harness.origin, `/api/admin/accounts/${sourceAccount.id}/deposits`, {
    method: 'POST', cookie: adminCookie, headers: { 'idempotency-key': depositKey },
    body: { amount: '100.0000', description: 'Synthetic test funding' },
  });
  assert.equal((await repeatedDeposit.json()).data.transaction.id, depositTransaction.id);

  const transferKey = 'stage-seven-transfer-0001';
  const transferBody = {
    destinationAccountId: destinationAccount.id,
    amount: '12.3456',
    description: 'Synthetic account transfer',
  };
  const transfer = await send(harness.origin, `/api/accounts/${sourceAccount.id}/transfers`, {
    method: 'POST', cookie: sessionCookie(ownerLogin), headers: { 'idempotency-key': transferKey }, body: transferBody,
  });
  assert.equal(transfer.status, 201);
  const transferTransaction = (await transfer.json()).data.transaction;
  assert.equal(transferTransaction.status, 'COMPLETED');
  assert.equal('idempotencyKey' in transferTransaction, false);
  assert.equal('requestHash' in transferTransaction, false);
  assert.deepEqual(transferTransaction.ledgerEntries.map((entry) => entry.type).sort(), ['CREDIT', 'DEBIT']);
  assert.equal(transferTransaction.ledgerEntries[0].amount, transferTransaction.ledgerEntries[1].amount);

  const retry = await send(harness.origin, `/api/accounts/${sourceAccount.id}/transfers`, {
    method: 'POST', cookie: sessionCookie(ownerLogin), headers: { 'idempotency-key': transferKey }, body: transferBody,
  });
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).data.transaction.id, transferTransaction.id);
  const keyReuse = await send(harness.origin, `/api/accounts/${sourceAccount.id}/transfers`, {
    method: 'POST', cookie: sessionCookie(ownerLogin), headers: { 'idempotency-key': transferKey },
    body: { ...transferBody, amount: '12.3457' },
  });
  assert.equal(keyReuse.status, 409);

  const sourceDetail = await send(harness.origin, `/api/accounts/${sourceAccount.id}`, { cookie: sessionCookie(ownerLogin) });
  const destinationDetail = await send(harness.origin, `/api/accounts/${destinationAccount.id}`, { cookie: sessionCookie(otherLogin) });
  assert.equal((await sourceDetail.json()).data.account.balance, '87.6544');
  assert.equal((await destinationDetail.json()).data.account.balance, '12.3456');
  const history = await send(harness.origin, `/api/accounts/${sourceAccount.id}/transactions`, { cookie: sessionCookie(ownerLogin) });
  assert.equal((await history.json()).data.transactions.length, 2);
  const adminTransactions = await send(harness.origin, `/api/admin/transactions?type=TRANSFER&status=COMPLETED&search=${transferTransaction.referenceId}`, { cookie: adminCookie });
  const adminTransactionPayload = await adminTransactions.json();
  assert.equal(adminTransactionPayload.data.total, 1);
  assert.equal('idempotencyKey' in adminTransactionPayload.data.transactions[0], false);
  assert.equal('requestHash' in adminTransactionPayload.data.transactions[0], false);
  assert.equal((await send(harness.origin, '/api/admin/transactions', { cookie: sessionCookie(ownerLogin) })).status, 403);

  const insufficient = await send(harness.origin, `/api/accounts/${sourceAccount.id}/transfers`, {
    method: 'POST', cookie: sessionCookie(ownerLogin), headers: { 'idempotency-key': 'stage-seven-transfer-0002' },
    body: { ...transferBody, amount: '1000' },
  });
  assert.equal(insufficient.status, 409);
  const foreignSource = await send(harness.origin, `/api/accounts/${sourceAccount.id}/transfers`, {
    method: 'POST', cookie: sessionCookie(otherLogin), headers: { 'idempotency-key': 'stage-seven-transfer-0003' }, body: transferBody,
  });
  assert.equal(foreignSource.status, 404);
  const missingKey = await send(harness.origin, `/api/accounts/${sourceAccount.id}/transfers`, {
    method: 'POST', cookie: sessionCookie(ownerLogin), body: transferBody,
  });
  assert.equal(missingKey.status, 400);
  const invalidAmount = await send(harness.origin, `/api/accounts/${sourceAccount.id}/transfers`, {
    method: 'POST', cookie: sessionCookie(ownerLogin), headers: { 'idempotency-key': 'stage-seven-transfer-0004' },
    body: { ...transferBody, amount: '0.0000' },
  });
  assert.equal(invalidAmount.status, 400);
  const attemptedLedgerMutation = await send(harness.origin, `/api/accounts/${sourceAccount.id}/transactions/${transferTransaction.id}`, {
    method: 'PUT', cookie: sessionCookie(ownerLogin), body: { amount: '1' },
  });
  assert.equal(attemptedLedgerMutation.status, 404);
  assert.equal(harness.state.auditLogs.filter((log) => log.action === 'SYNTHETIC_TRANSFER_COMPLETED').length, 1);
  assert.equal(harness.state.auditLogs.filter((log) => log.action === 'SYNTHETIC_DEPOSIT_COMPLETED').length, 1);
});

test('idempotent transaction retry resolves a concurrent serializable conflict', async () => {
  const actorId = randomUUID();
  const accountId = randomUUID();
  const idempotencyKey = 'stage-eight-concurrent-deposit';
  const request = { type: 'DEPOSIT', accountId, amount: '1', description: 'Concurrent retry test' };
  const requestHash = await import('node:crypto').then(({ createHash }) => createHash('sha256').update(JSON.stringify(request)).digest('hex'));
  const committed = {
    id: randomUUID(),
    referenceId: randomUUID(),
    idempotencyKey,
    requestHash,
    actorId,
    type: 'DEPOSIT',
    status: 'COMPLETED',
    amount: '1.0000',
    ledgerEntries: [],
  };
  let lookups = 0;
  const prisma = {
    ledgerTransaction: {
      findUnique: async () => (++lookups === 1 ? null : committed),
    },
    $transaction: async () => { throw Object.assign(new Error('Serialization conflict'), { code: 'P2034' }); },
  };

  const result = await createSyntheticDeposit({
    prisma,
    actorId,
    accountId,
    amount: '1.0000',
    description: 'Concurrent retry test',
    idempotencyKey,
  });
  assert.equal(result.id, committed.id);
});

test('Redis integration enforces the auth request limit', {
  skip: !process.env.REDIS_INTEGRATION_URL,
}, async (t) => {
  const redisClient = createClient({ url: process.env.REDIS_INTEGRATION_URL });
  redisClient.on('error', () => {});
  await redisClient.connect();
  const prefix = `balancevault:test:auth:${randomUUID()}:`;
  t.after(async () => {
    const keys = await redisClient.keys(`${prefix}*`);
    if (keys.length) {
      await redisClient.del(keys);
    }
    await redisClient.quit();
  });

  const app = createApp({
    configuration,
    prisma: null,
    redisClient,
    authRateLimiter: createAuthRateLimiter(redisClient, { windowMs: 60000, max: 1, prefix }),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const first = await send(origin, '/api/auth/register', { method: 'POST', body: {} });
  const second = await send(origin, '/api/auth/register', { method: 'POST', body: {} });
  assert.equal(first.status, 400);
  assert.equal(second.status, 429);
});

test('Redis integration revokes an authenticated session on logout', {
  skip: !process.env.REDIS_INTEGRATION_URL,
}, async (t) => {
  const redisClient = createClient({ url: process.env.REDIS_INTEGRATION_URL });
  redisClient.on('error', () => {});
  await redisClient.connect();
  let revocationKey;
  t.after(async () => {
    if (revocationKey) {
      await redisClient.del(revocationKey);
    }
    await redisClient.quit();
  });

  const dependencies = createMemoryDependencies();
  const app = createApp({
    ...dependencies,
    configuration,
    authRateLimiter: (_request, _response, next) => next(),
    passwordHasher: (password) => bcrypt.hash(password, 4),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const registered = await send(origin, '/api/auth/register', { method: 'POST', body: registration });
  const cookie = sessionCookie(registered);
  const token = cookie.slice(`${SESSION_COOKIE_NAME}=`.length);
  const claims = jwt.decode(token);
  revocationKey = `balancevault:revoked:${claims.jti}`;

  const logout = await send(origin, '/api/auth/logout', { method: 'POST', cookie });
  assert.equal(logout.status, 200);
  const profile = await send(origin, '/api/auth/me', { cookie });
  assert.equal(profile.status, 401);
});
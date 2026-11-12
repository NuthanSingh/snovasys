import { Router } from 'express';
import { createAccountsController } from '../controllers/accounts-controller.js';
import { createAdminAuditController } from '../controllers/admin-controller.js';
import { createDashboardController } from '../controllers/dashboard-controller.js';
import { createLedgerController } from '../controllers/ledger-controller.js';
import { createUsersController } from '../controllers/users-controller.js';
import { requireRole } from '../middleware/authorize.js';
import { requireTrustedOrigin } from '../middleware/trusted-origin.js';
import { validateBody } from '../validators/auth.js';
import {
  accountCreateSchema,
  accountListQuerySchema,
  accountStatusUpdateSchema,
  auditListQuerySchema,
  userListQuerySchema,
  userUpdateSchema,
  validatePathId,
  validateQuery,
} from '../validators/management.js';
import { adminTransactionQuerySchema, requireIdempotencyKey, syntheticDepositSchema } from '../validators/ledger.js';

export function createAdminManagementRouter({ prisma, configuration }) {
  const router = Router();
  const users = createUsersController({ prisma });
  const accounts = createAccountsController({ prisma });
  const dashboard = createDashboardController({ prisma });
  const ledger = createLedgerController({ prisma });
  router.use(requireRole('ADMIN'));
  router.use(requireTrustedOrigin(configuration));

  router.get('/dashboard', dashboard.admin);
  router.get('/transactions', validateQuery(adminTransactionQuerySchema), ledger.listAdmin);
  router.get('/users', validateQuery(userListQuerySchema), users.list);
  router.get('/users/:userId', validatePathId('userId'), users.get);
  router.put('/users/:userId', validatePathId('userId'), validateBody(userUpdateSchema), users.update);
  router.post('/users/:userId/accounts', validatePathId('userId'), validateBody(accountCreateSchema), accounts.createForUser);
  router.get('/accounts', validateQuery(accountListQuerySchema), accounts.listAdmin);
  router.get('/accounts/:accountId', validatePathId('accountId'), accounts.getAdmin);
  router.put('/accounts/:accountId/status', validatePathId('accountId'), validateBody(accountStatusUpdateSchema), accounts.updateStatus);
  router.post('/accounts/:accountId/deposits', validatePathId('accountId'), requireIdempotencyKey, validateBody(syntheticDepositSchema), ledger.deposit);
  router.get('/audit-logs', validateQuery(auditListQuerySchema), createAdminAuditController({ prisma }));
  return router;
}
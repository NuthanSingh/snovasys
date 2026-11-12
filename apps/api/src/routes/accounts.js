import { Router } from 'express';
import { createAccountsController } from '../controllers/accounts-controller.js';
import { createLedgerController } from '../controllers/ledger-controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { requireTrustedOrigin } from '../middleware/trusted-origin.js';
import { validatePathId } from '../validators/management.js';
import { requireIdempotencyKey, transferSchema } from '../validators/ledger.js';
import { validateBody } from '../validators/auth.js';

export function createAccountsRouter({ prisma, redisClient, configuration }) {
  const router = Router();
  const controller = createAccountsController({ prisma });
  const ledger = createLedgerController({ prisma });
  router.use(authenticate({ prisma, redisClient, configuration }));
  router.use(requireTrustedOrigin(configuration));
  router.get('/', controller.listOwn);
  router.get('/:accountId/transactions', validatePathId('accountId'), ledger.listOwn);
  router.post('/:accountId/transfers', requireRole('USER'), validatePathId('accountId'), requireIdempotencyKey, validateBody(transferSchema), ledger.transfer);
  router.get('/:accountId', validatePathId('accountId'), controller.getOwn);
  return router;
}
CREATE TYPE "LedgerTransactionType" AS ENUM ('DEPOSIT', 'TRANSFER');
CREATE TYPE "LedgerTransactionStatus" AS ENUM ('COMPLETED');

CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "referenceId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(128),
    "requestHash" CHAR(64),
    "type" "LedgerTransactionType" NOT NULL,
    "status" "LedgerTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "description" VARCHAR(240) NOT NULL,
    "actorId" UUID,
    "sourceAccountId" UUID,
    "destinationAccountId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ledger_transactions_amount_positive" CHECK ("amount" > 0)
);

INSERT INTO "ledger_transactions" (
    "id", "referenceId", "type", "status", "amount", "currency", "description",
    "sourceAccountId", "destinationAccountId", "createdAt"
)
SELECT
    gen_random_uuid(),
    entry."referenceId",
    CASE WHEN bool_or(entry."type" = 'DEBIT') THEN 'TRANSFER'::"LedgerTransactionType" ELSE 'DEPOSIT'::"LedgerTransactionType" END,
    'COMPLETED'::"LedgerTransactionStatus",
    max(entry."amount"),
    'USD',
    'Imported synthetic ledger entry',
    (SELECT source."accountId" FROM "ledger_entries" source WHERE source."referenceId" = entry."referenceId" AND source."type" = 'DEBIT' ORDER BY source."createdAt" LIMIT 1),
    (SELECT destination."accountId" FROM "ledger_entries" destination WHERE destination."referenceId" = entry."referenceId" AND destination."type" = 'CREDIT' ORDER BY destination."createdAt" LIMIT 1),
    min(entry."createdAt")
FROM "ledger_entries" entry
GROUP BY entry."referenceId";

ALTER TABLE "ledger_entries" ADD COLUMN "transactionId" UUID;

UPDATE "ledger_entries" entry
SET "transactionId" = ledger_tx."id"
FROM "ledger_transactions" ledger_tx
WHERE ledger_tx."referenceId" = entry."referenceId";

ALTER TABLE "ledger_entries" ALTER COLUMN "transactionId" SET NOT NULL;

CREATE UNIQUE INDEX "ledger_transactions_referenceId_key" ON "ledger_transactions"("referenceId");
CREATE UNIQUE INDEX "ledger_transactions_idempotencyKey_key" ON "ledger_transactions"("idempotencyKey");
CREATE INDEX "ledger_transactions_actorId_createdAt_idx" ON "ledger_transactions"("actorId", "createdAt");
CREATE INDEX "ledger_transactions_type_status_createdAt_idx" ON "ledger_transactions"("type", "status", "createdAt");
CREATE INDEX "ledger_transactions_sourceAccountId_createdAt_idx" ON "ledger_transactions"("sourceAccountId", "createdAt");
CREATE INDEX "ledger_transactions_destinationAccountId_createdAt_idx" ON "ledger_transactions"("destinationAccountId", "createdAt");
CREATE UNIQUE INDEX "ledger_entries_transactionId_accountId_type_key" ON "ledger_entries"("transactionId", "accountId", "type");

ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_sourceAccountId_fkey"
  FOREIGN KEY ("sourceAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_destinationAccountId_fkey"
  FOREIGN KEY ("destinationAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
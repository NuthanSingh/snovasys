ALTER TABLE "onboarding_requests"
  ADD COLUMN "phoneNumber" VARCHAR(16) NOT NULL DEFAULT '',
  ADD COLUMN "addressLine" VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN "city" VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN "postalCode" VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN "countryCode" CHAR(2) NOT NULL DEFAULT '',
  ADD COLUMN "activeSubmissionKey" UUID,
  ADD COLUMN "reviewComment" VARCHAR(500);

UPDATE "onboarding_requests"
SET "activeSubmissionKey" = "userId"
WHERE "status" = 'PENDING';

ALTER TABLE "onboarding_requests"
  ALTER COLUMN "phoneNumber" DROP DEFAULT,
  ALTER COLUMN "addressLine" DROP DEFAULT,
  ALTER COLUMN "city" DROP DEFAULT,
  ALTER COLUMN "postalCode" DROP DEFAULT,
  ALTER COLUMN "countryCode" DROP DEFAULT;

CREATE UNIQUE INDEX "onboarding_requests_activeSubmissionKey_key"
  ON "onboarding_requests"("activeSubmissionKey");

ALTER TABLE "onboarding_requests"
  ADD CONSTRAINT "onboarding_requests_activeSubmissionKey_owner_check"
  CHECK ("activeSubmissionKey" IS NULL OR "activeSubmissionKey" = "userId");
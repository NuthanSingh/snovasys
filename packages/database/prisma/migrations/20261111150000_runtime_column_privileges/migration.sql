REVOKE UPDATE ON "users", "accounts", "onboarding_requests" FROM balancevault_app;

GRANT UPDATE ("fullName", "status", "updatedAt")
  ON "users" TO balancevault_app;
GRANT UPDATE ("status", "updatedAt")
  ON "accounts" TO balancevault_app;
GRANT UPDATE ("status", "reviewedAt", "reviewedById", "reviewComment", "activeSubmissionKey", "updatedAt")
  ON "onboarding_requests" TO balancevault_app;
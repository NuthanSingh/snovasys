# BalanceVault Architecture

## Scope and trust boundaries

BalanceVault is a demonstration system using synthetic identities and balances only. It has no banking integrations and does not process real payments. Any displayed money movement is a simulated ledger operation.

The browser is an untrusted client. The Express API is the authorization boundary: it validates every request, derives the actor from the authenticated session, and scopes user queries to that actor unless an explicit backend permission grants broader access. The React app never decides access by itself.

## Planned repository map

```text
.
|-- README.md                       Project status and staged runbook
|-- package.json                    npm workspaces and root developer scripts
|-- .gitignore                      Local secrets, dependencies, and build output
|-- .env.example                    Names and safe examples for required settings
|-- apps/
|   |-- api/
|   |   |-- package.json             API scripts and dependencies
|   |   `-- src/
|   |       |-- app.js               Express app composition, middleware, and routes
|   |       |-- server.js            Startup and graceful shutdown
|   |       |-- config/              Environment parsing and service clients
|   |       |-- middleware/          Authentication, RBAC, validation, and errors
|   |       |-- routes/              REST route declarations
|   |       |-- controllers/         HTTP input/output handling
|   |       |-- services/            Business rules and transaction boundaries
|   |       |-- validators/           Request schemas and normalization
|   |       `-- lib/                  Shared API response and safe error helpers
|   |-- web/
|   |   |-- package.json             Vite/React scripts and dependencies
|   |   |-- index.html               Browser entry document
|   |   `-- src/
|   |       |-- main.jsx              React entry point
|   |       |-- App.jsx               Router and application shell
|   |       |-- styles/               Responsive design tokens and global styles
|   |       |-- components/            Reusable navigation, form, table, and status UI
|   |       |-- pages/                 Landing, auth, user, and admin screens
|   |       |-- features/               Auth, profile, onboarding, accounts, and admin flows
|   |       `-- lib/                   API client and frontend-safe utilities
|-- packages/
|   |-- database/
|   |   |-- package.json              Prisma scripts and database dependencies
|   |   |-- prisma.config.ts          Root environment URL and migration configuration
|   |   |-- src/index.js               Reusable PostgreSQL-backed Prisma client factory
|   |   `-- prisma/
|   |       |-- schema.prisma         PostgreSQL models, constraints, and indexes
|   |       |-- migrations/            Versioned Prisma SQL migrations
|   |       `-- seed.js                Idempotent role reference data; no demo credentials
|   `-- shared/
|       |-- package.json              Shared workspace package metadata
|       `-- src/index.js              Frontend/API-safe common constants and utilities
|-- infrastructure/
|   |-- compose.yaml                  Local PostgreSQL and Redis services
|   |-- postgres/                      Least-privilege local role bootstrap SQL
|   |-- nginx/                         Optional production web/API proxy configuration
|   `-- README.md                      Local service and deployment notes
|-- docs/
|   |-- architecture.md               This architecture and security decisions
|   `-- deployment.md                 Environment, migration, health, and readiness guide
|-- tests/
|   |-- api/                           API integration and authorization workflows
|   `-- web/                           Frontend/API integration checks
`-- scripts/
    |-- README.md                      Notes for root development/database commands
    `-- db-roles.*                     Database role setup helper (if needed)
```

Files may be consolidated or omitted where the implementation remains clearer without them. The map is a target, not a claim that those files or features already exist.

## Main data model

- `User`: normalized unique email, password hash, display name, status, timestamps, and role relation. Passwords and tokens are never returned by API serializers.
- `Role`: `USER`, `ADMIN`, or `BOOTSTRAP_ADMIN`. New public registrations receive only `USER`; elevated roles are assigned through a separately controlled bootstrap procedure.
- `Account`: synthetic account reference, owner, status, currency, and timestamps. All reads and updates are owner-scoped unless an administrator permission explicitly allows otherwise.
- `OnboardingRequest`: user, submitted details/status, reviewer, review time, and timestamps. State changes are validated and audited.
- `AuditLog`: actor, action, target type/ID, result, timestamp, and minimal non-secret metadata. No passwords, session tokens, or credential material are recorded.
- `LedgerTransaction`: synthetic deposit/transfer envelope with unique reference and idempotency key, fixed-point amount, status, actor, optional source/destination accounts, and linked ledger entries.
- `LedgerEntry`: immutable simulated debit/credit legs linked to a transaction. Transfers write equal debit/credit entries in one PostgreSQL transaction; balances are credits minus debits, calculated without floating-point arithmetic.

Prisma migrations use `DIRECT_URL` with the restricted `balancevault_migrator` role and `SHADOW_DATABASE_URL` for the dedicated shadow database. The API uses `DATABASE_URL` with `balancevault_app`; it does not own tables or have schema-altering privileges. The runtime role receives read/insert grants by default and column-level updates only for profile/status/review fields. It cannot update or delete audit, transaction, or ledger rows. The local Compose bootstrap SQL creates these roles with separate passwords; schema changes require the migration role. The migrator owns the shadow database but does not have cluster-wide `CREATEDB`.

## Authentication and authorization decisions

- Passwords are hashed with bcrypt; request schemas enforce sensible password and identity constraints.
- The API issues short-lived JWTs in `HttpOnly`, `Secure` (in production), `SameSite` cookies. The browser does not persist bearer tokens in local storage. Cookie-authenticated writes also require origin/CSRF defenses.
- Logout invalidates the session token identifier through Redis until its expiry. Redis is also used for configurable authentication/API rate limits; limits fail closed for authentication endpoints if Redis is unavailable.
- Authorization is enforced by API middleware and service-level ownership checks. `ADMIN` can manage permitted users, onboarding, and audit views. `BOOTSTRAP_ADMIN` is limited to provisioning/initial administrator responsibilities and does not inherit full admin access. The exact bootstrap flow will not expose a public role-escalation endpoint.
- CORS uses an explicit configured frontend origin; production uses TLS and secure headers. Errors return safe messages without stack traces or credentials.

## REST surface

All application routes are under `/api`; health checks are `/health` and `/ready`. The routes below clarify the resource identifiers that were abbreviated in the challenge brief.

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/users/me`, `PUT /api/users/me` for the signed-in user's own profile
- `POST /api/onboarding`, `GET /api/onboarding/me`, and owner-scoped `GET /api/onboarding/:requestId`
- `GET /api/admin/onboarding` and `GET /api/admin/onboarding/:requestId` are ADMIN-only; `PUT /api/admin/onboarding/:requestId/review` approves/rejects with an optional comment and atomic audit entry.
- `GET /api/accounts`, `GET /api/accounts/:accountId`, and `GET /api/accounts/:accountId/transactions` are owner-scoped; `POST /api/accounts/:accountId/transfers` requires USER ownership and an idempotency key.
- ADMIN-only `POST /api/admin/accounts/:accountId/deposits` creates a synthetic credit, and `GET /api/admin/transactions` provides filtered transaction history.
- `GET /api/admin/dashboard`, `GET /api/admin/users`, `PUT /api/admin/users/:userId`, and `GET /api/admin/audit-logs`
- `GET /api/dashboard/me`; `GET/PUT /api/users/me`; owner-scoped `GET /api/accounts` and `GET /api/accounts/:accountId`.
- ADMIN-only `GET /api/admin/dashboard`, user search/detail/update, account search/detail/status, synthetic account creation, and audit-log listing.
- `GET /api/admin/access` is a minimal Stage 4 authorization check; it does not implement a dashboard.

Responses use a consistent JSON envelope. List endpoints support bounded pagination and validated search/filter parameters. Request validation, authentication, authorization, centralized error handling, and audit recording are applied at the API boundary and relevant service operations.

## Stages and verification gates

1. **Architecture:** document module ownership and security boundaries.
2. **Workspace and local services:** create npm workspaces, install dependencies, configure environment templates, and define local PostgreSQL/Redis services.
3. **Schema and database roles (implemented and locally verified):** Prisma models and all four migrations are applied to the configured PostgreSQL 17 database. Runtime and migration roles are distinct; runtime ledger and audit mutation grants are absent.
4. **API foundation and security (implemented and verified):** request validation, registration/login/logout, JWT cookies, Redis-backed rate limiting/revocation, RBAC, and protected first-admin CLI bootstrap are implemented. API tests and Redis integration checks pass.
5. **Registration and onboarding workflow (implemented and verified):** owner-scoped onboarding submission/history, ADMIN-only request review, audit records, and React pages are implemented. API tests and browser registration/submission checks pass; admin-authenticated browser review remains unverified.
6. **Dashboards and account management (implemented and verified in API tests):** user/admin dashboards, profile, account list/details/history, user search/update, account lifecycle, and audit views have backend ownership/RBAC checks.
7. **Ledger and transactions (implemented and locally verified):** fixed-point balances, idempotent synthetic deposits/transfers, atomic transaction envelopes, immutable debit/credit entries, and audit events are covered by API tests and a synthetic PostgreSQL-backed check. No real payment integration exists.
8. **Integration, browser checks, and readiness review (locally verified with limitations):** backend tests, live Redis checks, browser user registration/onboarding/login/logout, responsive viewport rendering, schema validation, migration status, dependency audit, and frontend production build were checked. Admin-authenticated browser workflows and provider-backed deployment remain unverified. `/health` is liveness; `/ready` checks PostgreSQL and Redis.

A feature is only reported as implemented after code exists; it is only reported as tested or verified after the corresponding check has actually passed.

# BalanceVault

BalanceVault is a hackathon demonstration of secure account onboarding and auditable account operations. It uses synthetic data only. It will not connect to banks, move real funds, or represent simulated ledger activity as a real financial transaction.

## Project status

Stages 1 through 8 are implemented. PostgreSQL 17 connectivity, all four Prisma migrations, role seeding, and a first-admin audit record have been verified locally. API behavior is covered by tests, including optional live Redis integration; browser-based user registration and onboarding were also exercised locally. Synthetic ledger records were verified against PostgreSQL. Admin-authenticated browser workflows and a provider-backed production deployment have not been verified. All account activity is synthetic; no bank or payment integration exists.

## Prerequisites

- macOS on Apple silicon or Intel
- Node.js 20.19+ (Node.js 24 LTS recommended) and npm
- Docker Desktop for Mac, started before using the local database services

## Install

From the repository root:

```sh
npm install
cp -n .env.example .env
```

The second command creates a local `.env` from placeholders and does not overwrite an existing `.env`. Replace the three distinct password placeholders with strong local-only passwords. Put `POSTGRES_APP_PASSWORD` in the `DATABASE_URL` password field, and use `POSTGRES_MIGRATOR_PASSWORD` in both the `DIRECT_URL` and `SHADOW_DATABASE_URL` password fields. Never put production credentials in this file or commit it.

## Start PostgreSQL and Redis

After installing and starting Docker Desktop:

```sh
docker compose -f infrastructure/compose.yaml up -d
docker compose -f infrastructure/compose.yaml ps
```

The Compose file uses official multi-architecture images and a persistent PostgreSQL volume. On first initialization, its SQL script creates separate `balancevault_app` and `balancevault_migrator` roles and a `balancevault_shadow` database owned by the migrator for Prisma development migrations. The migrator does not receive cluster-wide `CREATEDB`. Compose initialization scripts run only when PostgreSQL initializes an empty data volume; an existing database needs an administrator to apply the role setup separately. These services contain synthetic demonstration data only. To stop the services without deleting their data:

```sh
docker compose -f infrastructure/compose.yaml stop
```

### Manual local services (without Docker)

On macOS with Homebrew, install and start local PostgreSQL and Redis:

```sh
brew install postgresql@17 redis
brew services start postgresql@17
brew services start redis
pg_isready -h 127.0.0.1 -p 5433
redis-cli -h 127.0.0.1 ping
```

Use the port PostgreSQL 17 actually listens on in all database commands and
connection URLs. Homebrew defaults to `5432`; use `5433` if another PostgreSQL
installation occupies that port and PostgreSQL 17 has been configured to use
`5433`.

Create the application database using a local PostgreSQL administrator account (replace `$(whoami)` if your database admin role has another name):

```sh
createdb -h 127.0.0.1 -p 5433 -U "$(whoami)" balancevault
set -a
source .env
set +a
psql -h 127.0.0.1 -p 5433 -U "$(whoami)" -d "$POSTGRES_DB" -f infrastructure/postgres/10-create-roles.sql
```

Set distinct strong local values in `.env` before running the SQL; the script creates `balancevault_app`, `balancevault_migrator`, and the Prisma shadow database. It is an initialization script and must not be rerun after those roles/databases exist. Then run the database commands below using the configured URLs. Do not copy real credentials into source files or chat.

## Start the application

Run the API and frontend together:

```sh
npm run dev
```

Or run them in separate terminals:

```sh
npm run dev:api
npm run dev:web
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The API listens on port `4000` by default.

## Production build and local startup check

Build the frontend bundle, start the API with its production entry point, and preview the generated frontend locally in separate terminals:

```sh
npm run build
npm run start --workspace=@balancevault/api
npm run preview --workspace=@balancevault/web
```

The Vite preview command is for local verification, not a production hosting service. The build output is `apps/web/dist`; serve it with a deployment platform of your choice only after selecting and reviewing that platform's configuration. No provider-specific deployment configuration or Dockerfiles are present in this repository.

## Verify the API

With the API running, use another terminal:

```sh
curl -i http://localhost:4000/health
curl -i http://localhost:4000/ready
```

`/health` is a liveness check. `/ready` verifies PostgreSQL with `SELECT 1` and Redis with `PING`; it returns HTTP 503 with dependency statuses if either service is unavailable. Neither endpoint returns credentials or raw connection errors.

## Database setup

Prisma schema and migrations live in `packages/database/prisma`. The `Role` table stores `USER`, `ADMIN`, and `BOOTSTRAP_ADMIN`; the seed only creates these role records, never a user or default administrator. The onboarding workflow migration adds synthetic contact/address fields, a review comment, and a unique active-submission key. The ledger migration adds a transaction envelope and links each immutable entry to it. A later security migration narrows runtime `UPDATE` privileges to only required profile/status/review columns. Ledger and transaction amounts are PostgreSQL `DECIMAL(19,4)` values, never floating-point values.

`DATABASE_URL` is the restricted application connection. `DIRECT_URL` is the separate migration/seed connection. `SHADOW_DATABASE_URL` points to the dedicated migration shadow database. The Compose bootstrap account is only for local database initialization and must not be used by the API. Prisma's config reads these URLs from the root `.env`.

With PostgreSQL running, use these commands from the repository root:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
```

`db:migrate` applies pending migrations through Prisma Migrate and creates a new development migration if the schema has changed. `db:seed` upserts the three role reference rows using `DIRECT_URL`; it creates no users and requires no demo-user password. To generate the Prisma Client without connecting to PostgreSQL, `npm run db:generate` still requires a root `.env` with both `DIRECT_URL` and `SHADOW_DATABASE_URL` set because Prisma loads the same config.

Required database settings: `POSTGRES_DB`, `POSTGRES_SHADOW_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (local Compose bootstrap), `POSTGRES_APP_PASSWORD`, `POSTGRES_MIGRATOR_PASSWORD`, `DATABASE_URL`, `DIRECT_URL`, and `SHADOW_DATABASE_URL`. Keep `.env` private; only `.env.example` belongs in source control.

The onboarding and ledger workflows require the migrations in `packages/database/prisma/migrations` to be applied to the target database. Check that database's migration status before relying on onboarding, ledger, or role privileges; the migration files being present does not establish that a database has applied them.

## Authentication and authorization

Authentication lives in the Express API. Registration accepts `fullName`, `email`, and a password of at least 12 characters and no more than 72 UTF-8 bytes; the server normalizes email, rejects extra fields such as `role`, hashes the password with bcrypt, assigns the seeded `USER` role, and records an audit event. Login returns the same error for an unknown email and a wrong password. Neither password hashes nor JWTs appear in JSON responses.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/register` | Create a `PENDING` user with `USER` role and start a session. |
| `POST /api/auth/login` | Verify email/password and start a session. |
| `POST /api/auth/logout` | Revoke the current session in Redis and clear its cookie. |
| `GET /api/auth/me` | Return only the authenticated user's safe profile. |
| `POST /api/onboarding` | Submit required synthetic contact/address details for the signed-in user. |
| `GET /api/onboarding/me` | List only the signed-in user's onboarding history and review status. |
| `GET /api/onboarding/:requestId` | Read a request only when it belongs to the signed-in user. |
| `GET /api/admin/onboarding?status=PENDING` | `ADMIN`-only request queue; filter by `PENDING`, `APPROVED`, or `REJECTED`. |
| `GET /api/admin/onboarding/:requestId` | `ADMIN`-only request details. |
| `PUT /api/admin/onboarding/:requestId/review` | `ADMIN`-only `APPROVED`/`REJECTED` decision with optional comment. |
| `GET /api/users/me`, `PUT /api/users/me` | Read/update only the current user's display name. |
| `GET /api/dashboard/me` | Current user's profile summary, owned accounts, onboarding status, and recent ledger entries. |
| `GET /api/accounts`, `GET /api/accounts/:accountId` | List/read only the current user's own accounts and operation history. |
| `GET /api/accounts/:accountId/transactions` | List transactions involving an account only after verifying ownership. |
| `POST /api/accounts/:accountId/transfers` | Atomic synthetic transfer; requires `Idempotency-Key`, active accounts, matching currency, and sufficient balance. |
| `GET /api/admin/dashboard` | `ADMIN`-only live counts for users, onboarding, accounts, and recent audit events. |
| `GET /api/admin/users`, `GET /api/admin/users/:userId`, `PUT /api/admin/users/:userId` | `ADMIN`-only search/filter/detail and permitted full-name/status changes. Role changes are not accepted. |
| `GET /api/admin/accounts`, `GET /api/admin/accounts/:accountId` | `ADMIN`-only account search, detail, and history. |
| `POST /api/admin/users/:userId/accounts`, `PUT /api/admin/accounts/:accountId/status` | Create synthetic account records for active users and update permitted account status transitions. |
| `POST /api/admin/accounts/:accountId/deposits` | Add an explicitly synthetic deposit to an active account; requires `Idempotency-Key`. |
| `GET /api/admin/transactions` | `ADMIN`-only transaction overview with type/status/search filters. |
| `GET /api/admin/audit-logs` | `ADMIN`-only paginated audit history with optional action filter. |
| `GET /api/admin/access` | Minimal `ADMIN`-only authorization check; this is not a dashboard. |

Successful register/login responses set a short-lived JWT in an `HttpOnly`, `SameSite=Lax` cookie scoped to `/api`; production also sets `Secure`. The browser does not receive a bearer token in the response body. Logout adds the token ID to a Redis denylist until expiry and records `AUTH_LOGOUT` without storing the token. Register/login requests are rate-limited through Redis and fail closed with `503` if Redis is unavailable. Cookie-authenticated writes reject a mismatched `Origin`.

Role permissions: `USER` can access their own authenticated profile, onboarding records, accounts, and account history. `ADMIN` can access dashboards, user/account management, onboarding review, and audit history. `BOOTSTRAP_ADMIN` is denied normal admin routes; first-admin setup is performed only by the protected CLI, not an authenticated bootstrap-role session. There is no public role assignment or admin-registration endpoint.

Onboarding requests require a phone number in international format, address, city, postal code, and two-letter country code. The API permits one `PENDING` request per user, records submission/review actions in `AuditLog`, and prevents an administrator from reviewing their own request. Review is atomic: state update and audit entry are written in one transaction. User endpoints only return that user's records; the admin queue/detail endpoints require `ADMIN` on the backend. `BOOTSTRAP_ADMIN` cannot review requests.

## Dashboards and account management

User and administrator pages call the API; they do not include demo account rows. If there are no account records or ledger entries, the pages show empty states. Administrators can create a synthetic checking/savings record for an `ACTIVE` user; this creates no balance and does not move funds. Account status transitions are constrained by the API, and a `CLOSED` account cannot be reopened. User account reads are scoped by both account ID and authenticated owner ID.

The admin user API supports search by name/email, role/status filters, pagination, and detail views. Updates accept only `fullName` and `ACTIVE`/`SUSPENDED` status; role fields are rejected, admins cannot change their own status, and the last active administrator cannot be suspended. Admin user/account changes are audited.

Database status: PostgreSQL 17 on the local Homebrew service is configured at `127.0.0.1:5433`. Runtime and migrator URLs have been verified. Prisma reports all four migrations applied and the schema up to date; role seeding and first-admin bootstrap were verified. This is local verification only, not a production database setup.

## Synthetic ledger and transactions

Transactions and their ledger entries are created in one PostgreSQL transaction. Transfers write equal debit/credit legs for different active accounts in the same currency. An administrator may issue a synthetic deposit, which creates one credit leg; it is not a real payment or bank deposit. Both operations require an `Idempotency-Key`; an identical retry returns the original transaction, while reusing the key with a different payload is rejected.

Amounts are validated as decimal strings and balances are calculated with fixed-point integer arithmetic at four decimal places. Ledger entries have no update/delete API, and the runtime database role lacks update/delete grants on ledger tables. Failed operations roll back without retaining partial transaction/ledger rows.

The migrations `20261111140000_ledger_transactions` and `20261111150000_runtime_column_privileges` are applied locally. A synthetic PostgreSQL-backed check verified fixed-point balances, an atomic double-entry transfer, idempotent retries, insufficient-funds rollback, and transaction audit records. API integration tests also cover these behaviors with in-memory dependencies.

### First administrator

The only bootstrap path is a one-time CLI command, not an HTTP endpoint. First configure PostgreSQL roles, apply the migrations, and seed the role rows as described above. Then set these values in the ignored root `.env`: `BOOTSTRAP_ADMIN_FULL_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and `BOOTSTRAP_ADMIN_CONFIRM=CREATE_FIRST_ADMIN`. Use a unique password of at least 12 characters; do not commit or share it. Run:

```sh
npm run admin:bootstrap
```

The script uses the restricted `DATABASE_URL`, takes a PostgreSQL advisory lock, refuses to run if any `ADMIN` already exists, creates one active admin, and writes `FIRST_ADMIN_BOOTSTRAP` in the same transaction. It prints no credentials. Remove the four bootstrap values from `.env` immediately after success. A repeated or unconfirmed attempt is rejected. No default administrator is seeded.

### Authentication environment

- `JWT_SECRET`: generate a unique local secret with `openssl rand -hex 32`; the example placeholder is intentionally rejected.
- `JWT_EXPIRES_IN`: token lifetime such as `15m`; maximum accepted lifetime is 24 hours.
- `REDIS_URL`: required for the Redis-backed auth limiter and logout revocation.
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`: auth request window and per-IP attempt limit.
- `WEB_ORIGIN`: exact browser origin allowed by CORS and auth-origin checks.
- `DATABASE_URL`: restricted application role used by auth operations and bootstrap.
- `DIRECT_URL` and `SHADOW_DATABASE_URL`: migration/seed and Prisma shadow database URLs.
- `BOOTSTRAP_ADMIN_FULL_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and `BOOTSTRAP_ADMIN_CONFIRM`: one-time local bootstrap inputs only.

Run the API tests with `npm run test:api`. They use in-memory Prisma fakes and do not prove database connectivity. The Redis rate-limit and logout-revocation checks can be run against local Redis with `REDIS_INTEGRATION_URL=redis://127.0.0.1:6379 npm run test:api`; those checks use unique keys and remove their test keys. Run the frontend production build with `npm run build`. `/health` is liveness; `/ready` checks PostgreSQL and Redis and returns `503` when either is unavailable. Never place real secrets in source control or chat.

See [docs/architecture.md](docs/architecture.md) for the project map and security boundaries, [docs/deployment.md](docs/deployment.md) for operations and deployment readiness gates, and [infrastructure/README.md](infrastructure/README.md) for local service troubleshooting.

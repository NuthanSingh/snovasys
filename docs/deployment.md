# Deployment and operations

BalanceVault is a synthetic-data demonstration. It is not a banking product, does
not connect to financial institutions, and must not be used to process real
funds or identity data. This repository does not include provider-specific
deployment configuration, production container images, or a public deployment.
Treat this document as a readiness checklist, not authorization to deploy.

## Local prerequisites

- Node.js 20.19+ and npm.
- PostgreSQL 17 and Redis 7, reachable from the development machine.
- A private root `.env` created from `.env.example`; `.gitignore` excludes it.
- PostgreSQL roles and databases configured using the local setup instructions
  in the root [README](../README.md).

Use the database port that PostgreSQL actually listens on. For example, where
another local PostgreSQL installation occupies 5432, a separately configured
Homebrew PostgreSQL 17 service may use 5433. Do not change database credentials
or service configuration merely to match an example.

## Environment configuration

Runtime API settings:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime connection as the restricted `balancevault_app` role. |
| `REDIS_URL` | Authentication rate-limit and session-revocation service. |
| `JWT_SECRET` | Private signing secret; use at least 32 random bytes. |
| `WEB_ORIGIN` | Exact browser origin accepted by CORS and origin checks. |

Keep database migration credentials outside the API runtime:

| Variable | Purpose |
| --- | --- |
| `DIRECT_URL` | Migration and seed connection as `balancevault_migrator`. |
| `SHADOW_DATABASE_URL` | Dedicated Prisma migration shadow database connection. |

`PORT` defaults to 4000, `JWT_EXPIRES_IN` to `15m`, and auth rate-limit settings
to a 15-minute window and 10 attempts. `VITE_API_BASE_URL` is consumed at
frontend build time and must point to the intended API origin.

The `POSTGRES_DB`, `POSTGRES_SHADOW_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_APP_PASSWORD`, and `POSTGRES_MIGRATOR_PASSWORD` variables are used by
the optional local Compose initialization. They are not substitutes for valid
database role credentials and are not needed to run against an already
configured Homebrew PostgreSQL server.

When `NODE_ENV=production`, the API fails at startup unless `DATABASE_URL`
uses PostgreSQL, `REDIS_URL` uses Redis, `JWT_SECRET` is a non-placeholder value
of at least 32 bytes, and `WEB_ORIGIN` is an exact HTTPS origin. Configure
these values through a deployment secret manager; do not use the development
defaults or a committed environment file.

Never paste `.env` values into logs, chat, source control, or build artifacts.
The one-time `BOOTSTRAP_ADMIN_*` values are only for first-admin setup and should
be cleared after success. Do not set bootstrap variables for routine startup.

## Local setup and verification

Run from the repository root:

```sh
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
npm run test:api
REDIS_INTEGRATION_URL=redis://127.0.0.1:6379 npm run test:api
npm run dev
```

The seed creates role reference rows only. First-admin provisioning is a
separate, confirmed CLI operation; never enable a public admin-registration
route. `npm run dev` starts the API and Vite frontend. The frontend defaults to
`http://localhost:5173`, and the API defaults to `http://localhost:4000`.

Check liveness and dependency readiness:

```sh
curl -i http://localhost:4000/health
curl -i http://localhost:4000/ready
```

`/health` is a liveness response. `/ready` checks PostgreSQL and Redis and
returns HTTP 503 when either dependency is unavailable. Neither endpoint
returns connection strings or raw dependency errors.

## Production readiness gates

Do not expose the development servers publicly. Before any controlled
production-like deployment:

1. Select and review a hosting platform and deployment topology; none is
   configured in this repository.
2. Provide managed PostgreSQL and Redis with backups, restore procedures,
   access controls, and monitoring. Keep the application role least-privileged
   and separate from the migration role.
3. Configure secrets through the platform's secret manager, not a committed
   file. Use a unique production `JWT_SECRET`, exact `WEB_ORIGIN`, and TLS.
   Production session cookies require HTTPS (`Secure`).
4. Apply migrations through a reviewed release job using the migration role;
   do not run development migration commands as an application startup hook.
5. Build the frontend with its intended `VITE_API_BASE_URL`; deploy the static
   bundle only behind the reviewed HTTPS origin and API routing/CORS policy.
6. Verify `/health`, `/ready`, authentication throttling, logout revocation,
   authorization boundaries, audit persistence, database permissions,
   backups, logs, and rollback procedures in a non-production environment.
7. Review all dependency advisories and operational/security requirements at
   release time. A local dependency audit is not a production security
   certification.

There is no provider-specific deployment manifest, reverse proxy, TLS setup,
production Dockerfile, or deployment automation here. No public deployment has
been performed. The application is suitable for a controlled local synthetic
demo after the documented local services are available, not for real money or
identity workflows.

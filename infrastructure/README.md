# Local infrastructure

`compose.yaml` defines local PostgreSQL and Redis services using official multi-architecture images, including Apple silicon support. PostgreSQL data is stored in the named `postgres_data` volume. Both ports are bound to loopback for local development.

Prerequisites: Docker Desktop for Mac installed and running, plus a local `.env` created from the root `.env.example`.

If Docker is unavailable on macOS, install local services with Homebrew using the commands in the root README. Start PostgreSQL and Redis manually, create the application database, and run the least-privilege role script once as a PostgreSQL administrator. This repository contains no Dockerfiles or provider-specific deployment configuration.

On a new PostgreSQL data volume, the init script creates `balancevault_app` and `balancevault_migrator`, then creates `POSTGRES_SHADOW_DB` owned by the migrator. It reads distinct app and migrator passwords from the environment. The bootstrap account is only for local initialization; the application must use `DATABASE_URL`. Init scripts do not run again on an existing data volume, so have a database administrator apply role setup separately when reusing one.

For an existing local PostgreSQL server where these roles have not been created, set `POSTGRES_USER` in `.env` to a database administrator account, then run this once from the repository root:

```sh
set -a
source .env
set +a
psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f infrastructure/postgres/10-create-roles.sql
```

Do not rerun this script after the roles and shadow database exist; it is an initialization script, not an idempotent migration.

From the repository root:

```sh
docker compose -f infrastructure/compose.yaml up -d
docker compose -f infrastructure/compose.yaml ps
docker compose -f infrastructure/compose.yaml logs postgres redis
docker compose -f infrastructure/compose.yaml stop
```

Do not run `docker compose down -v` unless you intentionally want to permanently delete the local PostgreSQL data volume. These services are for synthetic demonstration data only.
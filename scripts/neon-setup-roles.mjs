// One-time setup of the BalanceVault database roles on a hosted PostgreSQL (Neon) database.
//
// Usage (from the repository root):
//   node scripts/neon-setup-roles.mjs [.env.neon]
//
// The env file must contain NEON_OWNER_URL (the owner connection string from the Neon console).
// The script:
//   1. creates (or re-keys) the restricted balancevault_app and balancevault_migrator roles,
//   2. grants the same schema privileges as infrastructure/postgres/10-create-roles.sql,
//   3. sets the migrator's default privileges so new tables are SELECT/INSERT-only for the app role,
//   4. writes DATABASE_URL, DIRECT_URL and SHADOW_DATABASE_URL back into the env file.
// It never prints passwords or connection strings.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';

const envFile = process.argv[2] ?? '.env.neon';
if (!existsSync(envFile)) {
  console.error(`Env file ${envFile} was not found. Create it with NEON_OWNER_URL first.`);
  process.exit(1);
}

const values = dotenv.parse(readFileSync(envFile));
if (!values.NEON_OWNER_URL) {
  console.error(`NEON_OWNER_URL is missing in ${envFile}.`);
  process.exit(1);
}

// Use the direct (non-pooled) endpoint: migrations need session features such as advisory locks.
function connectionUrl(raw, user, password) {
  const url = new URL(raw);
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.delete('channel_binding');
  url.searchParams.set('sslmode', 'require');
  if (user) {
    url.username = user;
    url.password = password;
  }
  return url.toString();
}

const ownerUrl = connectionUrl(values.NEON_OWNER_URL);
const databaseName = decodeURIComponent(new URL(ownerUrl).pathname.slice(1));
const appPassword = values.NEON_APP_PASSWORD || randomBytes(24).toString('hex');
const migratorPassword = values.NEON_MIGRATOR_PASSWORD || randomBytes(24).toString('hex');
const appUrl = connectionUrl(ownerUrl, 'balancevault_app', appPassword);
const migratorUrl = connectionUrl(ownerUrl, 'balancevault_migrator', migratorPassword);

const owner = new pg.Client({ connectionString: ownerUrl });
await owner.connect();
try {
  for (const [role, password] of [['balancevault_app', appPassword], ['balancevault_migrator', migratorPassword]]) {
    const existing = await owner.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    if (existing.rowCount) {
      await owner.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${owner.escapeLiteral(password)}`);
      console.info(`Role ${role} already existed; its password was set from ${envFile}.`);
    } else {
      await owner.query(
        `CREATE ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD ${owner.escapeLiteral(password)}`,
      );
      console.info(`Role ${role} created.`);
    }
  }

  await owner.query(`GRANT CONNECT ON DATABASE ${owner.escapeIdentifier(databaseName)} TO balancevault_app, balancevault_migrator`);
  await owner.query('GRANT USAGE ON SCHEMA public TO balancevault_app');
  await owner.query('GRANT USAGE, CREATE ON SCHEMA public TO balancevault_migrator');
  console.info('Schema privileges granted.');
} finally {
  await owner.end();
}

// Default privileges must be declared by the role that will own the tables.
const migrator = new pg.Client({ connectionString: migratorUrl });
await migrator.connect();
try {
  await migrator.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO balancevault_app');
  await migrator.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO balancevault_app');
  console.info('Default privileges for the app role are set.');
} finally {
  await migrator.end();
}

const updates = {
  NEON_APP_PASSWORD: appPassword,
  NEON_MIGRATOR_PASSWORD: migratorPassword,
  DATABASE_URL: appUrl,
  DIRECT_URL: migratorUrl,
  SHADOW_DATABASE_URL: migratorUrl,
};
const kept = readFileSync(envFile, 'utf8')
  .split('\n')
  .filter((line) => !Object.keys(updates).some((key) => line.startsWith(`${key}=`)));
while (kept.length && kept.at(-1).trim() === '') kept.pop();
const written = Object.entries(updates).map(([key, value]) => `${key}="${value}"`);
writeFileSync(envFile, `${[...kept, ...written].join('\n')}\n`, { mode: 0o600 });

console.info(`Done. DATABASE_URL, DIRECT_URL and SHADOW_DATABASE_URL were saved to ${envFile} (not printed).`);

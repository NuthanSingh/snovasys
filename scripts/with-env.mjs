// Run a command with variables loaded from an env file, without printing them.
//
// Usage (from the repository root):
//   node scripts/with-env.mjs .env.neon -- npm run db:seed
//
// Values in the env file override variables already set in the shell.

import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';

const [envFile, separator, command, ...args] = process.argv.slice(2);
if (!envFile || separator !== '--' || !command) {
  console.error('Usage: node scripts/with-env.mjs <env-file> -- <command> [args...]');
  process.exit(1);
}
if (!existsSync(envFile)) {
  console.error(`Env file ${envFile} was not found.`);
  process.exit(1);
}

const values = dotenv.parse(readFileSync(envFile));
const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...values } });
child.on('error', () => {
  console.error(`Could not start ${command}.`);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));

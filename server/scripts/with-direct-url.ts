import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Neon pooled hosts (`*-pooler*`) cannot hold Prisma migrate advisory locks (P1002).
 * Prisma `directUrl` must be set whenever it appears in schema.prisma.
 */
export function envWithDirectUrl(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  let databaseUrl = env.DATABASE_URL?.trim();

  // `prisma generate` only needs the vars present — not a live DB.
  if (!databaseUrl) {
    databaseUrl = 'postgresql://prisma:prisma@127.0.0.1:5432/prisma?schema=public';
    env.DATABASE_URL = databaseUrl;
  }

  let direct = env.DIRECT_URL?.trim();
  if (!direct) {
    direct = /-pooler/i.test(databaseUrl)
      ? databaseUrl.replace(/-pooler/gi, '')
      : databaseUrl;
    env.DIRECT_URL = direct;
  }

  if (!env.PRISMA_MIGRATE_ADVISORY_LOCK_TIMEOUT) {
    env.PRISMA_MIGRATE_ADVISORY_LOCK_TIMEOUT = '60000';
  }

  return env;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  // Side-effect import / ensure only
  Object.assign(process.env, envWithDirectUrl());
} else {
  execSync(args.join(' '), {
    stdio: 'inherit',
    env: envWithDirectUrl(),
    cwd: resolve(__dirname, '..'),
    shell: true,
  });
}

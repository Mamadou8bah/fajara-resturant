import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import { envWithDirectUrl } from './with-direct-url';

// Prefer staging env over any ambient / prisma auto-loaded .env
config({ path: resolve(__dirname, '../.env.staging'), override: true });

execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: envWithDirectUrl(),
  cwd: resolve(__dirname, '..'),
});

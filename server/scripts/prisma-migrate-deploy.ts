import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { config } from 'dotenv';

// Prefer staging env over any ambient / prisma auto-loaded .env
config({ path: resolve(__dirname, '../.env.staging'), override: true });

execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: process.env,
  cwd: resolve(__dirname, '..'),
});

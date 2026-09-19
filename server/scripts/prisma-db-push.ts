import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../.env.staging'), override: true });

execSync('npx prisma db push', {
  stdio: 'inherit',
  env: process.env,
  cwd: resolve(__dirname, '..'),
});

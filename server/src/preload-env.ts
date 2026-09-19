import { existsSync } from 'fs';
import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';

const appEnv = process.env.APP_ENV ?? 'development';
for (const file of [
  `.env.${appEnv}.local`,
  `.env.${appEnv}`,
  '.env.local',
  '.env',
]) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) {
    loadDotenv({ path, override: false });
  }
}

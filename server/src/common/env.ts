export type AppEnv = 'development' | 'staging' | 'production';

const WEAK_JWT = new Set([
  '',
  'change-me',
  'change-me-in-production-use-long-random-string',
  'dev-only-change-me',
]);

export function resolveAppEnv(): AppEnv {
  const raw = (process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development')
    .trim()
    .toLowerCase();
  if (raw === 'staging' || raw === 'production' || raw === 'development') {
    return raw;
  }
  if (raw === 'prod') return 'production';
  if (raw === 'dev' || raw === 'test') return 'development';
  return 'development';
}

export function assertEnvironmentSafe(): AppEnv {
  const appEnv = resolveAppEnv();
  const jwt = process.env.JWT_SECRET?.trim() ?? '';

  if (appEnv === 'staging' || appEnv === 'production') {
    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error(`[${appEnv}] DATABASE_URL is required`);
    }
    if (WEAK_JWT.has(jwt) || jwt.length < 32) {
      throw new Error(`[${appEnv}] JWT_SECRET is missing or too weak`);
    }
    if (!process.env.CORS_ORIGIN?.trim()) {
      throw new Error(`[${appEnv}] CORS_ORIGIN is required`);
    }
  }

  return appEnv;
}

export function jwtSecretForEnv(appEnv: AppEnv): string {
  const jwt = process.env.JWT_SECRET?.trim();
  if (jwt && !WEAK_JWT.has(jwt)) return jwt;
  if (appEnv === 'development') return jwt || 'dev-only-change-me';
  throw new Error(`[${appEnv}] JWT_SECRET is required`);
}

/** Browser Origin has no trailing slash; normalize env values so both forms work. */
export function corsOrigins(
  raw = process.env.CORS_ORIGIN ?? 'http://localhost:3000',
): string[] {
  const list = raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return list.length > 0 ? list : ['http://localhost:3000'];
}

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { IdempotencyScope, Prisma } from '@prisma/client';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { IdempotencyService } from '../idempotency/idempotency.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parseScope(raw?: string): IdempotencyScope | null {
  const v = raw?.trim().toUpperCase();
  if (!v) return null;
  if (v === 'ORDER') return IdempotencyScope.ORDER;
  if (v === 'PAYMENT') return IdempotencyScope.PAYMENT;
  if (v === 'SESSION') return IdempotencyScope.SESSION;
  if (v === 'KITCHEN') return IdempotencyScope.KITCHEN;
  if (v === 'MUTATION') return IdempotencyScope.MUTATION;
  return null;
}

function scopeFromPath(path: string, headerScope: IdempotencyScope | null) {
  if (headerScope) return headerScope;
  if (path.includes('/payments')) return IdempotencyScope.PAYMENT;
  if (path.includes('/orders')) return IdempotencyScope.ORDER;
  if (path.includes('/sessions') || path.includes('/tables'))
    return IdempotencyScope.SESSION;
  if (path.includes('/kitchen')) return IdempotencyScope.KITCHEN;
  return IdempotencyScope.MUTATION;
}

/**
 * Replays staff mutations that send X-Client-Request-Id so offline queue
 * flushes are safe. ORDER/PAYMENT handlers that already use IdempotencyService
 * with the same key will still be consistent (second begin returns replay).
 */
@Injectable()
export class ClientRequestIdInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      path?: string;
      headers: Record<string, string | string[] | undefined>;
      user?: { id?: string };
      body?: Record<string, unknown>;
    }>();

    const method = (req.method ?? 'GET').toUpperCase();
    if (!MUTATING.has(method)) {
      return next.handle();
    }

    const headerKey = String(
      req.headers['x-client-request-id'] ??
        req.headers['X-Client-Request-Id'] ??
        '',
    ).trim();
    const bodyKey =
      req.body && typeof req.body.clientRequestId === 'string'
        ? String(req.body.clientRequestId).trim()
        : '';
    const key = headerKey || bodyKey;
    if (!key) {
      return next.handle();
    }

    // ORDER/PAYMENT services already own begin/complete with body clientRequestId.
    // Skip interceptor double-wrap for those DTO-driven paths to avoid nested keys.
    const path = req.originalUrl ?? req.url ?? req.path ?? '';
    const clean = path.split('?')[0] ?? path;
    const isOwned =
      clean.endsWith('/payments/settle') ||
      clean.endsWith('/orders') ||
      clean.endsWith('/guest/orders');

    if (isOwned && bodyKey) {
      return next.handle();
    }

    const headerScope = parseScope(
      String(
        req.headers['x-idempotency-scope'] ??
          req.headers['X-Idempotency-Scope'] ??
          '',
      ),
    );
    const scope = scopeFromPath(path, headerScope);
    const employeeId = req.user?.id;

    return from(this.idempotency.begin(scope, key, employeeId)).pipe(
      switchMap((begin) => {
        if (begin.replay) {
          return of(begin.response ?? { ok: true, replayed: true });
        }
        return next.handle().pipe(
          tap({
            next: (response) => {
              void this.idempotency.complete(
                scope,
                key,
                (response ?? { ok: true }) as Prisma.InputJsonValue,
              );
            },
            error: () => {
              void this.idempotency.abandon(scope, key);
            },
          }),
        );
      }),
    );
  }
}

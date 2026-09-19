/** Build square app-icon URLs from a restaurant logo (Cloudinary transform when possible). */

export function resolveMediaUrl(path?: string | null): string | null {
  if (!path?.trim()) return null;
  const p = path.trim();
  if (/^https?:\/\//i.test(p) || p.startsWith('data:') || p.startsWith('blob:')) {
    return p;
  }
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
    'http://localhost:4000/api';
  const origin = apiBase.replace(/\/api$/, '');
  return p.startsWith('/') ? `${origin}${p}` : `${origin}/${p}`;
}

/**
 * Prefer a square PNG icon. Cloudinary URLs get w/h/c_fill; other URLs are used as-is.
 * Pass the original logo URL (not an already-transformed icon URL).
 */
export function brandedIconUrl(
  logoUrl: string | null | undefined,
  size: number,
): string | null {
  const raw = resolveMediaUrl(logoUrl ?? null);
  if (!raw) return null;
  const cloudinary = raw.match(
    /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i,
  );
  if (cloudinary) {
    const [, prefix, rest] = cloudinary;
    // Drop prior transformation segments (everything before vNNNN or the public id path).
    const segments = rest.split('/');
    let start = 0;
    while (
      start < segments.length &&
      !/^v\d+$/i.test(segments[start]) &&
      (segments[start].includes(',') ||
        (/^[a-z0-9_]+$/i.test(segments[start]) && segments[start].includes('_')))
    ) {
      start += 1;
    }
    const path = segments.slice(start).join('/');
    return `${prefix}w_${size},h_${size},c_fill,g_auto,f_png,q_auto/${path}`;
  }
  return raw;
}

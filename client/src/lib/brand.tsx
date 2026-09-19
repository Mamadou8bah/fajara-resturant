'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fetchSettings } from '@/features/settings/api';

/** Resolve uploaded / relative media paths against the API origin. */
export function mediaUrl(path?: string | null): string | null {
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

export type RestaurantBrand = {
  name: string;
  tradingName: string;
  logoUrl: string | null;
};

const DEFAULT_BRAND: RestaurantBrand = {
  name: 'Fajara',
  tradingName: 'Restaurant Services',
  logoUrl: null,
};

function brandFromSettings(s: {
  restaurantName?: unknown;
  profile?: unknown;
}): RestaurantBrand {
  const profile = (s.profile ?? {}) as {
    tradingName?: string;
    logoUrl?: string;
  };
  const name =
    String(profile.tradingName ?? '').trim() ||
    String(s.restaurantName ?? '').trim() ||
    DEFAULT_BRAND.name;
  const tradingName =
    String(profile.tradingName ?? '').trim() ||
    String(s.restaurantName ?? '').trim() ||
    DEFAULT_BRAND.tradingName;
  return {
    name: name.split(/\s+/)[0] || name,
    tradingName,
    logoUrl: mediaUrl(profile.logoUrl ?? null),
  };
}

/** Staff surfaces — authenticated settings. */
export function useRestaurantBrand() {
  const [brand, setBrand] = useState<RestaurantBrand>(DEFAULT_BRAND);

  useEffect(() => {
    let cancelled = false;
    void fetchSettings()
      .then((s) => {
        if (!cancelled) setBrand(brandFromSettings(s));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return brand;
}

/** Guest / public surfaces. */
export function usePublicBrand() {
  const [brand, setBrand] = useState<RestaurantBrand>(DEFAULT_BRAND);

  useEffect(() => {
    let cancelled = false;
    void api<{
      restaurantName?: string;
      profile?: { tradingName?: string; logoUrl?: string };
    }>('/settings/public', { public: true })
      .then((s) => {
        if (!cancelled) setBrand(brandFromSettings(s));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return brand;
}

export function BrandLogo({
  src,
  alt = 'Restaurant logo',
  className = 'h-10 w-10 object-contain',
  fallback,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const url = mediaUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return <>{fallback ?? null}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

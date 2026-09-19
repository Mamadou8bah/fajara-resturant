'use client';

import { useEffect } from 'react';
import { brandedIconUrl } from '@/lib/app-icons';
import { usePublicBrand } from '@/lib/brand';

function upsertIconLink(
  key: string,
  attrs: { rel: string; href: string; sizes?: string; type?: string },
) {
  let el = document.querySelector(
    `link[data-brand-icon="${key}"]`,
  ) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('data-brand-icon', key);
    document.head.appendChild(el);
  }
  el.rel = attrs.rel;
  el.href = attrs.href;
  if (attrs.sizes) el.sizes = attrs.sizes;
  else el.removeAttribute('sizes');
  if (attrs.type) el.type = attrs.type;
  else el.removeAttribute('type');
}

/**
 * When the manager has set a restaurant logo, use it as the browser /
 * home-screen app icon (favicon + apple-touch-icon). Manifest icons come
 * from app/manifest.ts.
 */
export function AppIconSync() {
  const brand = usePublicBrand();

  useEffect(() => {
    const raw = brand.logoUrl;
    if (!raw) return;

    const i192 = brandedIconUrl(raw, 192) || raw;
    const i512 = brandedIconUrl(raw, 512) || raw;
    const i180 = brandedIconUrl(raw, 180) || raw;

    upsertIconLink('icon-192', {
      rel: 'icon',
      href: i192,
      sizes: '192x192',
      type: 'image/png',
    });
    upsertIconLink('icon-512', {
      rel: 'icon',
      href: i512,
      sizes: '512x512',
      type: 'image/png',
    });
    upsertIconLink('apple', {
      rel: 'apple-touch-icon',
      href: i180,
      sizes: '180x180',
    });

    if (brand.tradingName) {
      document
        .querySelectorAll('meta[name="apple-mobile-web-app-title"]')
        .forEach((m) => {
          m.setAttribute('content', brand.name || brand.tradingName);
        });
    }
  }, [brand.logoUrl, brand.name, brand.tradingName]);

  return null;
}

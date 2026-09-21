import type { MetadataRoute } from 'next';
import { brandedIconUrl } from '@/lib/app-icons';

function apiBase() {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
    'http://localhost:4000/api'
  );
}

const FALLBACK_ICONS: MetadataRoute.Manifest['icons'] = [
  {
    src: '/icon-192.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'any',
  },
  {
    src: '/icon-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'any',
  },
  {
    src: '/icon-maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
];

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = 'Fajara';
  let shortName = 'Fajara';
  let rawLogo: string | null = null;

  try {
    const res = await fetch(`${apiBase()}/settings/public`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const s = (await res.json()) as {
        restaurantName?: string;
        profile?: { tradingName?: string; logoUrl?: string };
      };
      const full =
        String(s.profile?.tradingName ?? '').trim() ||
        String(s.restaurantName ?? '').trim() ||
        name;
      name = full;
      shortName = full.split(/\s+/)[0] || full;
      rawLogo = s.profile?.logoUrl?.trim() || null;
    }
  } catch {
    /* defaults when API unreachable */
  }

  const icon192 = brandedIconUrl(rawLogo, 192);
  const icon512 = brandedIconUrl(rawLogo, 512);

  const icons: MetadataRoute.Manifest['icons'] =
    icon512 && icon192
      ? [
          {
            src: icon192,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: icon512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: icon512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ]
      : FALLBACK_ICONS;

  return {
    name,
    short_name: shortName.slice(0, 12),
    description: `${name} staff app`,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#F3ECE0',
    theme_color: '#F3ECE0',
    icons,
  };
}

'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

export type Appearance = {
  theme?: string;
  /** Scheme id, or `custom` when derived from customHue. */
  accent?: string;
  accentColor?: string;
  /** Empty = theme default unless scheme/custom sets it. */
  sidebarColor?: string;
  /** 0–360 — used when accent === 'custom' to derive a harmonious pair. */
  customHue?: number;
  fontSize?: string;
  kitchenHiVis?: boolean;
};

/** Paired accent + sidebar — same hue family, never clashing. */
export type ColourScheme = {
  id: string;
  label: string;
  accent: string;
  sidebar: string;
};

export const COLOUR_SCHEMES: ColourScheme[] = [
  {
    id: 'terracotta',
    label: 'Terracotta',
    accent: '#c0613d',
    sidebar: '#3d2418',
  },
  {
    id: 'ready',
    label: 'Forest',
    accent: '#2f7d63',
    sidebar: '#1a3329',
  },
  {
    id: 'warn',
    label: 'Gold',
    accent: '#c4922e',
    sidebar: '#3a2e14',
  },
  {
    id: 'afrimoney',
    label: 'Sunset',
    accent: '#d4783a',
    sidebar: '#3d2616',
  },
  {
    id: 'slate',
    label: 'Slate',
    accent: '#5f7186',
    sidebar: '#1e2630',
  },
  {
    id: 'ink',
    label: 'Ink',
    accent: '#5c4a38',
    sidebar: '#271a11',
  },
];

/** @deprecated use COLOUR_SCHEMES — kept for Settings swatch labels */
export const ACCENT_PRESETS = COLOUR_SCHEMES.map((s) => ({
  id: s.id,
  label: s.label,
  color: s.accent,
}));

/** Sidebar swatches = dark tones from the same schemes (no foreign hues). */
export const SIDEBAR_PRESETS = COLOUR_SCHEMES.map((s) => ({
  id: s.id,
  label: s.label,
  color: s.sidebar,
}));

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Accent (mid) + sidebar (dark) from one hue — always harmonious. */
export function harmoniousFromHue(hue: number): {
  accent: string;
  sidebar: string;
} {
  const h = ((hue % 360) + 360) % 360;
  return {
    accent: hslToHex(h, 0.48, 0.48),
    sidebar: hslToHex(h, 0.32, 0.16),
  };
}

function huesClose(a: number, b: number, maxDeg = 28): boolean {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d) <= maxDeg;
}

/**
 * Resolve a non-clashing accent/sidebar pair.
 * Independent custom sidebar hues are snapped to the accent family.
 */
export function resolveHarmoniousColors(a: Appearance): {
  accent: string;
  sidebar: string | null;
} {
  const scheme = COLOUR_SCHEMES.find((s) => s.id === (a.accent || 'terracotta'));

  if (a.accent === 'custom' || (a.customHue != null && !scheme)) {
    const hue =
      a.customHue ??
      hexToHsl(a.accentColor || '#c0613d')?.h ??
      18;
    const pair = harmoniousFromHue(hue);
    return { accent: pair.accent, sidebar: pair.sidebar };
  }

  if (scheme) {
    // Sidebar must stay in the same scheme family (no foreign contrast).
    let sidebar = scheme.sidebar;
    if (a.sidebarColor && /^#[0-9a-fA-F]{6}$/.test(a.sidebarColor)) {
      const sh = hexToHsl(a.sidebarColor);
      const ah = hexToHsl(scheme.accent);
      if (sh && ah && huesClose(sh.h, ah.h)) {
        // Same family — keep chosen lightness but lock hue/sat to scheme.
        sidebar = hslToHex(ah.h, Math.max(sh.s, 0.22), clamp(sh.l, 0.1, 0.28));
      } else {
        sidebar = scheme.sidebar;
      }
    }
    return { accent: scheme.accent, sidebar };
  }

  // Unknown accent id with hex — derive pair from that hue.
  if (a.accentColor && /^#[0-9a-fA-F]{6}$/.test(a.accentColor)) {
    const hsl = hexToHsl(a.accentColor);
    if (hsl) {
      const pair = harmoniousFromHue(hsl.h);
      return { accent: pair.accent, sidebar: pair.sidebar };
    }
  }

  const fallback = COLOUR_SCHEMES[0];
  return { accent: fallback.accent, sidebar: fallback.sidebar };
}

/** Relative luminance 0–1; low values are dark. */
function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function applySidebarVars(root: HTMLElement, hex: string | null) {
  if (!hex) {
    root.style.removeProperty('--sidebar');
    root.style.removeProperty('--sidebar-fg');
    root.style.removeProperty('--sidebar-muted');
    root.style.removeProperty('--sidebar-edge');
    root.style.removeProperty('--sidebar-hover');
    return;
  }
  const light = luminance(hex) > 0.55;
  root.style.setProperty('--sidebar', hex);
  root.style.setProperty('--sidebar-fg', light ? '#271a11' : '#f3ece0');
  root.style.setProperty(
    '--sidebar-muted',
    light ? 'rgba(39,26,17,0.55)' : 'rgba(243,236,224,0.55)',
  );
  root.style.setProperty(
    '--sidebar-edge',
    light ? 'rgba(39,26,17,0.12)' : 'rgba(255,255,255,0.12)',
  );
  root.style.setProperty(
    '--sidebar-hover',
    light ? 'rgba(39,26,17,0.08)' : 'rgba(255,255,255,0.1)',
  );
}

export function applyAppearance(a: Appearance | null | undefined) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = a?.theme || 'warmLight';
  const accentId = a?.accent || 'terracotta';
  root.dataset.theme = theme;
  root.dataset.accent = accentId;
  root.dataset.font = a?.fontSize || 'default';

  const { accent, sidebar } = resolveHarmoniousColors(a ?? {});
  let cta = accent;
  if (theme === 'warmDark' && luminance(cta) < 0.18) {
    cta = '#e0c8b0';
  }
  root.style.setProperty('--cta', cta);
  applySidebarVars(root, sidebar);

  try {
    localStorage.setItem(
      'fajara.kitchenHiVis',
      a?.kitchenHiVis ? '1' : '0',
    );
    localStorage.setItem('fajara.appearance', JSON.stringify(a ?? {}));
  } catch {
    /* ignore */
  }
}

/** Loads saved appearance for signed-in staff and applies CSS dataset attrs. */
export function AppearanceApplier() {
  const { user, token } = useAuth();

  useEffect(() => {
    try {
      const raw = localStorage.getItem('fajara.appearance');
      if (raw) applyAppearance(JSON.parse(raw) as Appearance);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!user || !token) return;
    let cancelled = false;
    void api<{ appearance?: Appearance }>('/settings')
      .then((s) => {
        if (cancelled) return;
        applyAppearance((s.appearance as Appearance) ?? {});
      })
      .catch(() => {
        /* guest / no access — keep local */
      });
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  return null;
}

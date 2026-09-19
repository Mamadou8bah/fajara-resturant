/** Server-safe session loading shell (no client hooks). */
export const SSR_SHELL_ID = 'fajara-app-ssr-shell';

export function SessionLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-cream">
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 text-center">
        <div className="loader loader-lg" aria-hidden />
        <p className="font-display text-lg font-semibold text-ink">
          Getting things ready…
        </p>
        <p className="max-w-[16rem] text-sm text-muted">
          One moment while we open your workspace.
        </p>
      </div>
    </div>
  );
}

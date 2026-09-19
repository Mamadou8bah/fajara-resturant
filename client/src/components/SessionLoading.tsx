/** Server-safe session loading shell (no client hooks). */
export const SSR_SHELL_ID = 'fajara-app-ssr-shell';

export function SessionLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-cream">
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-4 text-sm text-muted">
        <div className="loader loader-lg" aria-hidden />
        <p>Checking session…</p>
      </div>
    </div>
  );
}

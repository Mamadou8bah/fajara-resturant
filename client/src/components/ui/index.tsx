import { useState, type ReactNode } from 'react';
import { SearchableSelect } from './SearchableSelect';

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[#E0D5C4] bg-white p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'up' | 'down' | 'warn';
}) {
  const hintColor =
    tone === 'up'
      ? 'text-ready'
      : tone === 'down'
        ? 'text-cta'
        : tone === 'warn'
          ? 'text-warn'
          : 'text-muted';
  return (
    <Panel className="min-h-[110px]">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-bold text-ink md:text-3xl">
        {value}
      </p>
      {hint ? <p className={`mt-2 text-xs font-medium ${hintColor}`}>{hint}</p> : null}
    </Panel>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  busy = false,
  busyLabel,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  /** Shows spinner + busyLabel and disables the button while true. */
  busy?: boolean;
  busyLabel?: string;
}) {
  const styles =
    variant === 'primary'
      ? 'bg-cta text-cream hover:brightness-110'
      : variant === 'danger'
        ? 'bg-[#F3D9CE] text-cta hover:bg-[#EEC4B4]'
        : variant === 'outline'
          ? 'border border-cta text-cta hover:bg-[#F6E4DC]'
          : 'text-ink hover:bg-[#EDE6DA]';
  return (
    <button
      type="button"
      disabled={Boolean(disabled || busy)}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {busy ? (
        <>
          <span className="loader loader-sm shrink-0" aria-hidden />
          <span>{busyLabel ?? 'Working…'}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <Panel className="text-center">
      <p className="font-display text-lg font-bold text-ink">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted">{body}</p> : null}
    </Panel>
  );
}

export function LoadingBlock({
  label = 'Loading…',
  size = 'md',
}: {
  label?: string;
  size?: 'md' | 'lg';
}) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-4 text-sm text-muted">
      <div
        className={`loader ${size === 'lg' ? 'loader-lg' : ''}`}
        aria-hidden
      />
      <p>{label}</p>
    </div>
  );
}

export { ErrorBanner } from './ErrorBanner';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
  onSubmit,
  collapsible = false,
  defaultOpen,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onSubmit?: () => void;
  /** When true, starts closed behind a magnifying-glass toggle. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? !collapsible);

  if (collapsible && !open) {
    return (
      <button
        type="button"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D4C4B0] bg-white text-ink ${className}`}
        aria-label={placeholder}
        onClick={() => setOpen(true)}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
        </svg>
      </button>
    );
  }

  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${className}`}>
      {collapsible ? (
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D4C4B0] bg-white text-ink"
          aria-label="Close search"
          onClick={() => {
            setOpen(false);
            onChange('');
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
      <input
        type="search"
        className="input-field min-w-0 flex-1"
        placeholder={placeholder}
        value={value}
        autoFocus={collapsible}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === 'Escape' && collapsible) {
            setOpen(false);
            onChange('');
          }
        }}
        aria-label={placeholder}
      />
    </div>
  );
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  scroll = true,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  scroll?: boolean;
}) {
  return (
    <div className={scroll ? 'chip-scroll' : 'flex flex-wrap gap-2'}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`min-h-touch shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              active ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink active:bg-[#E8DFD0]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder ?? 'Filter'}
      emptyOptionLabel={placeholder ?? 'All'}
      allowEmpty={Boolean(placeholder)}
      className={`min-w-[140px] ${className}`}
    />
  );
}

export { SearchableSelect } from './SearchableSelect';


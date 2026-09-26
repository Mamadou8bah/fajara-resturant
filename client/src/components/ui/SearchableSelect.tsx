'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  emptyLabel = 'No matches',
  className = '',
  allowEmpty = true,
  emptyOptionLabel = 'None',
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        className="input-field flex w-full items-center justify-between gap-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setQuery('');
        }}
      >
        <span className={selected ? 'text-ink' : 'text-muted'}>
          {selected?.label ?? placeholder}
        </span>
        <span className="text-muted" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-[#D4C4B0] bg-white shadow-lg">
          <input
            autoFocus
            type="search"
            className="w-full border-b border-[#E0D5C4] px-3 py-2.5 text-sm outline-none"
            placeholder="Type to filter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
          />
          <ul
            role="listbox"
            className="max-h-48 overflow-auto py-1 text-sm"
          >
            {allowEmpty ? (
              <li>
                <button
                  type="button"
                  className={`flex w-full px-3 py-2 text-left hover:bg-[#EDE6DA] ${
                    !value ? 'font-semibold text-cta' : 'text-muted'
                  }`}
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  {emptyOptionLabel}
                </button>
              </li>
            ) : null}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-muted">{emptyLabel}</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    className={`flex w-full px-3 py-2 text-left hover:bg-[#EDE6DA] ${
                      o.value === value ? 'font-semibold text-cta' : 'text-ink'
                    }`}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    {o.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

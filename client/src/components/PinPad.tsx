'use client';

import { useState } from 'react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'ok'];

export function PinPad({
  length = 4,
  onComplete,
  disabled,
}: {
  length?: number;
  onComplete: (pin: string) => void;
  disabled?: boolean;
}) {
  const [pin, setPin] = useState('');

  function press(key: string) {
    if (disabled) return;
    if (key === 'clear') {
      setPin('');
      return;
    }
    if (key === 'ok') {
      if (pin.length === length) onComplete(pin);
      return;
    }
    if (pin.length >= length) return;
    const next = pin + key;
    setPin(next);
    if (next.length === length) onComplete(next);
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-5 flex justify-center gap-3">
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${
              i < pin.length ? 'bg-cta' : 'bg-[#E0D5C4]'
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => press(key)}
            className="flex min-h-[64px] items-center justify-center rounded-2xl bg-white text-xl font-bold text-ink shadow-sm active:scale-95 disabled:opacity-50"
          >
            {key === 'clear' ? 'C' : key === 'ok' ? '✓' : key}
          </button>
        ))}
      </div>
    </div>
  );
}

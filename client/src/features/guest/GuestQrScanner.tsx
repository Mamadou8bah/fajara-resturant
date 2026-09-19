'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

type BarcodeDetectorLike = {
  detect: (
    source: ImageBitmapSource,
  ) => Promise<Array<{ rawValue?: string }>>;
};

function getBarcodeDetector():
  | (new (opts?: { formats?: string[] }) => BarcodeDetectorLike)
  | null {
  if (typeof window === 'undefined') return null;
  const BD = (
    window as unknown as {
      BarcodeDetector?: new (opts?: {
        formats?: string[];
      }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  return BD ?? null;
}

/** Pull a guest menu token from a scanned QR payload (URL or raw token). */
export function tokenFromQrPayload(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const m = url.pathname.match(/\/m\/([^/]+)\/?$/);
    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch {
    /* not a full URL */
  }
  const pathMatch = text.match(/\/m\/([^/?#\s]+)\/?/);
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  // Bare token from our QR exports (no spaces, reasonable length)
  if (/^[A-Za-z0-9_-]{8,128}$/.test(text)) return text;
  return null;
}

export function GuestQrScanner({
  onToken,
  onCancel,
}: {
  onToken: (token: string) => void;
  onCancel?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    handledRef.current = false;

    async function start() {
      setStarting(true);
      setError(null);
      const BD = getBarcodeDetector();
      if (!BD) {
        setError(
          'This browser can’t scan QR codes in-app. Open your phone Camera app and point it at the table QR instead.',
        );
        setStarting(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera is not available on this device.');
        setStarting(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStarting(false);

        const detector = new BD({ formats: ['qr_code'] });
        const tick = async () => {
          if (cancelled || handledRef.current) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              const raw = codes[0]?.rawValue;
              if (raw) {
                const token = tokenFromQrPayload(raw);
                if (token) {
                  handledRef.current = true;
                  stop();
                  onToken(token);
                  return;
                }
              }
            }
          } catch {
            /* keep scanning */
          }
          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
        };
        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      } catch {
        if (!cancelled) {
          setError(
            'Camera permission denied. Allow camera access, or use your phone Camera app on the table QR.',
          );
          setStarting(false);
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [onToken, stop]);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-[#271A11]">
        <video
          ref={videoRef}
          className="aspect-[3/4] w-full object-cover"
          playsInline
          muted
          autoPlay
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-48 w-48 rounded-3xl border-2 border-cream/80 shadow-[0_0_0_9999px_rgba(39,26,17,0.45)]" />
        </div>
        {starting ? (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm font-semibold text-cream">
            Starting camera…
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="rounded-2xl bg-[#F3D9CE] px-3 py-2 text-sm text-cta">
          {error}
        </p>
      ) : (
        <p className="text-center text-sm text-muted">
          Point at the QR on your table
        </p>
      )}
      {onCancel ? (
        <Button variant="outline" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredToken } from '@/lib/api';
import { LoadingBlock } from '@/components/ui';

/**
 * Site root: staff entry. Guests reach the menu only via table QR (/t or /m).
 */
export default function RootRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (getStoredToken()) {
      router.replace('/app/dashboard');
      return;
    }
    router.replace('/app/login');
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
      <LoadingBlock label="Opening…" />
    </main>
  );
}

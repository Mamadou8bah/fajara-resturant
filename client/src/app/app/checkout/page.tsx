'use client';

import { Suspense } from 'react';
import { CheckoutScreen } from '@/features/checkout/CheckoutScreen';
import { LoadingBlock } from '@/components/ui';

export default function CheckoutPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading checkout…" />}>
      <CheckoutScreen />
    </Suspense>
  );
}

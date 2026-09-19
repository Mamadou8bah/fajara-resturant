'use client';

import { use } from 'react';
import { GuestMenuScreen } from '@/features/guest/GuestMenuScreen';

export default function GuestMenuPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <GuestMenuScreen token={token} />;
}

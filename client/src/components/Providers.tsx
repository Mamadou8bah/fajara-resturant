'use client';

import { AuthProvider } from '@/lib/auth';
import { GuestSessionProvider } from '@/lib/guest-session';
import { StaffSyncProvider } from '@/lib/staffSync';
import { AppearanceApplier } from '@/components/AppearanceApplier';
import { PwaRegister } from '@/components/PwaRegister';
import { SentryInit } from '@/components/SentryInit';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <StaffSyncProvider>
        <GuestSessionProvider>
          <SentryInit />
          <AppearanceApplier />
          <PwaRegister />
          {children}
        </GuestSessionProvider>
      </StaffSyncProvider>
    </AuthProvider>
  );
}

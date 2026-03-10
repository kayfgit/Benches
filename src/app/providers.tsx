'use client';

import { SessionProvider } from 'next-auth/react';
import { AppStateProvider } from '@/lib/store';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppStateProvider>{children}</AppStateProvider>
    </SessionProvider>
  );
}

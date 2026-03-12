'use client';

import { SessionProvider } from 'next-auth/react';
import { AppStateProvider } from '@/lib/store';
import { ToastProvider } from '@/components/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppStateProvider>
        <ToastProvider>{children}</ToastProvider>
      </AppStateProvider>
    </SessionProvider>
  );
}

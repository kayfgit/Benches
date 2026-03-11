'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { AppState, Bench } from '@/types';

const AppContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [selectedBench, setSelectedBench] = useState<Bench | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showAddBench, setShowAddBench] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [benches, setBenches] = useState<Bench[]>([]);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);

  const addBench = useCallback((bench: Bench) => {
    setBenches((prev) => [bench, ...prev]);
  }, []);

  return (
    <AppContext.Provider
      value={{
        selectedBench, setSelectedBench,
        showAuth, setShowAuth,
        authMode, setAuthMode,
        showAddBench, setShowAddBench,
        pickingLocation, setPickingLocation,
        pickedLocation, setPickedLocation,
        benches, setBenches,
        addBench,
        flyTo, setFlyTo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}

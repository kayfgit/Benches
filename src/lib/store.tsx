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
  const [zoomLevel, setZoomLevel] = useState(2.8); // Camera distance from center
  const [shouldResumeRotation, setShouldResumeRotation] = useState(false);
  const [forumButtonPulse, setForumButtonPulse] = useState(false);
  const [transitioningBenchId, setTransitioningBenchId] = useState<string | null>(null);
  const [showForum, setShowForum] = useState(false);

  const addBench = useCallback((bench: Bench) => {
    setBenches((prev) => [bench, ...prev]);
  }, []);

  const removeBench = useCallback((benchId: string) => {
    setBenches((prev) => prev.filter((b) => b.id !== benchId));
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
        addBench, removeBench,
        flyTo, setFlyTo,
        zoomLevel, setZoomLevel,
        shouldResumeRotation, setShouldResumeRotation,
        forumButtonPulse, setForumButtonPulse,
        transitioningBenchId, setTransitioningBenchId,
        showForum, setShowForum,
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

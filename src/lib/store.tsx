'use client';

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { AppState, Bench, SortOption } from '@/types';

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
  const [globeReady, setGlobeReady] = useState(false);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Get unique countries from benches
  const countries = useMemo(() => {
    const countrySet = new Set<string>();
    benches.forEach((b) => {
      if (b.country) {
        // Extract just the country name (first part before comma)
        const country = b.country.split(',')[0].trim();
        if (country) countrySet.add(country);
      }
    });
    return Array.from(countrySet).sort();
  }, [benches]);

  // Filtered and sorted benches
  const filteredBenches = useMemo(() => {
    let result = [...benches];

    // Filter by search query (name or description)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(query) ||
          b.description.toLowerCase().includes(query)
      );
    }

    // Filter by country
    if (filterCountry) {
      result = result.filter((b) => b.country?.startsWith(filterCountry));
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'popular':
        result.sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
        break;
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return result;
  }, [benches, searchQuery, filterCountry, sortBy]);

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
        globeReady, setGlobeReady,
        // Search and filter
        searchQuery, setSearchQuery,
        filterCountry, setFilterCountry,
        sortBy, setSortBy,
        countries,
        filteredBenches,
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

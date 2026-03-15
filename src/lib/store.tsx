'use client';

import { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode } from 'react';
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
  const [topBenches, setTopBenches] = useState<Bench[]>([]); // Top 10 globally - always visible
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(2.8); // Camera distance from center
  const [cameraLatLng, setCameraLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [shouldResumeRotation, setShouldResumeRotation] = useState(false);
  const [forumButtonPulse, setForumButtonPulse] = useState(false);
  const [transitioningBenchId, setTransitioningBenchId] = useState<string | null>(null);
  const [showForum, setShowForum] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);

  // Track loaded regions to avoid re-fetching
  const loadedRegionsRef = useRef<Set<string>>(new Set());

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Fetch top benches (called once on mount)
  const fetchTopBenches = useCallback(async () => {
    try {
      const res = await fetch('/api/benches?mode=top');
      if (res.ok) {
        const data = await res.json();
        setTopBenches(data);
      }
    } catch (e) {
      console.error('Failed to fetch top benches:', e);
    }
  }, []);

  // Fetch benches in a region (called when zoomed in)
  const fetchRegionBenches = useCallback(async (minLat: number, maxLat: number, minLng: number, maxLng: number) => {
    // Create a region key to track what we've loaded
    const regionKey = `${minLat.toFixed(1)},${maxLat.toFixed(1)},${minLng.toFixed(1)},${maxLng.toFixed(1)}`;

    if (loadedRegionsRef.current.has(regionKey)) {
      return; // Already loaded this region
    }

    try {
      const res = await fetch(
        `/api/benches?mode=region&minLat=${minLat}&maxLat=${maxLat}&minLng=${minLng}&maxLng=${maxLng}`
      );
      if (res.ok) {
        const data: Bench[] = await res.json();
        loadedRegionsRef.current.add(regionKey);

        // Merge with existing benches, avoiding duplicates
        setBenches(prev => {
          const existingIds = new Set(prev.map(b => b.id));
          const newBenches = data.filter(b => !existingIds.has(b.id));
          return [...prev, ...newBenches];
        });
      }
    } catch (e) {
      console.error('Failed to fetch region benches:', e);
    }
  }, []);

  // Top bench IDs for quick lookup
  const topBenchIds = useMemo(() => new Set(topBenches.map(b => b.id)), [topBenches]);

  // All benches combined (top + loaded regions), deduplicated
  const allBenches = useMemo(() => {
    const combined = [...topBenches];
    const ids = new Set(topBenches.map(b => b.id));
    for (const b of benches) {
      if (!ids.has(b.id)) {
        combined.push(b);
        ids.add(b.id);
      }
    }
    return combined;
  }, [topBenches, benches]);

  // Get unique countries from all benches
  const countries = useMemo(() => {
    const countrySet = new Set<string>();
    allBenches.forEach((b) => {
      if (b.country) {
        // Extract just the country name (first part before comma)
        const country = b.country.split(',')[0].trim();
        if (country) countrySet.add(country);
      }
    });
    return Array.from(countrySet).sort();
  }, [allBenches]);

  // Filtered and sorted benches (from all loaded benches)
  const filteredBenches = useMemo(() => {
    let result = [...allBenches];

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
  }, [allBenches, searchQuery, filterCountry, sortBy]);

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
        benches: allBenches, setBenches,
        topBenches, topBenchIds,
        addBench, removeBench,
        flyTo, setFlyTo,
        zoomLevel, setZoomLevel,
        cameraLatLng, setCameraLatLng,
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
        // Lazy loading
        fetchTopBenches, fetchRegionBenches,
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

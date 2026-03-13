export interface BenchPhoto {
  id: string;
  url: string;
}

export interface Bench {
  id: string;
  name: string;
  description: string;
  directions?: string;
  latitude: number;
  longitude: number;
  country: string;
  altitude: number | null;
  photos: BenchPhoto[];
  userId: string;
  userName?: string;
  createdAt: string;
  voteCount?: number;
  userVote?: number; // 1, -1, or 0/undefined
  commentCount?: number;
}

export interface Comment {
  id: string;
  content: string;
  benchId: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface Issue {
  id: string;
  title: string;
  content: string;
  type: 'bench' | 'bug';
  status: 'open' | 'resolved' | 'closed';
  benchId?: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export type SortOption = 'newest' | 'oldest' | 'popular' | 'name';

export interface AppState {
  selectedBench: Bench | null;
  setSelectedBench: (b: Bench | null) => void;
  showAuth: boolean;
  setShowAuth: (v: boolean) => void;
  authMode: 'login' | 'register';
  setAuthMode: (m: 'login' | 'register') => void;
  showAddBench: boolean;
  setShowAddBench: (v: boolean) => void;
  pickingLocation: boolean;
  setPickingLocation: (v: boolean) => void;
  pickedLocation: { lat: number; lng: number } | null;
  setPickedLocation: (loc: { lat: number; lng: number } | null) => void;
  benches: Bench[];
  setBenches: (b: Bench[]) => void;
  addBench: (b: Bench) => void;
  removeBench: (benchId: string) => void;
  flyTo: { lat: number; lng: number } | null;
  setFlyTo: (loc: { lat: number; lng: number } | null) => void;
  zoomLevel: number;
  setZoomLevel: (level: number) => void;
  shouldResumeRotation: boolean;
  setShouldResumeRotation: (v: boolean) => void;
  forumButtonPulse: boolean;
  setForumButtonPulse: (v: boolean) => void;
  transitioningBenchId: string | null;
  setTransitioningBenchId: (id: string | null) => void;
  showForum: boolean;
  setShowForum: (show: boolean) => void;
  globeReady: boolean;
  setGlobeReady: (v: boolean) => void;
  // Search and filter
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterCountry: string;
  setFilterCountry: (c: string) => void;
  sortBy: SortOption;
  setSortBy: (s: SortOption) => void;
  countries: string[];
  filteredBenches: Bench[];
  // Settings
  performanceMode: boolean;
  setPerformanceMode: (v: boolean) => void;
}

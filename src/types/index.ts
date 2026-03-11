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
}

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
  flyTo: { lat: number; lng: number } | null;
  setFlyTo: (loc: { lat: number; lng: number } | null) => void;
  zoomLevel: number;
  setZoomLevel: (level: number) => void;
  shouldResumeRotation: boolean;
  setShouldResumeRotation: (v: boolean) => void;
}

'use client';

import { useSession, signOut } from 'next-auth/react';
import { useAppState } from '@/lib/store';

export function Navbar() {
  const { data: session } = useSession();
  const { setShowAuth, setAuthMode, setShowAddBench, setFlyTo } = useAppState();

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFlyTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        alert('Unable to get your location');
      }
    );
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="flex items-center justify-between px-5 py-3">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold to-gold-light flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#070b14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 18h16" />
              <path d="M4 14h16" />
              <path d="M6 14V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" />
              <path d="M6 18v2" />
              <path d="M18 18v2" />
            </svg>
          </div>
          <h1 className="font-display text-xl font-semibold tracking-wide text-text-primary">
            BenchFinder
          </h1>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleNearMe}
            className="btn-ghost flex items-center gap-2 text-sm py-2 px-3"
            title="Find benches near you"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
            </svg>
            <span className="hidden sm:inline">Near Me</span>
          </button>

          {session ? (
            <>
              <button
                onClick={() => setShowAddBench(true)}
                className="btn-gold flex items-center gap-2 text-sm py-2 px-3"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span className="hidden sm:inline">Add Bench</span>
              </button>
              <div className="flex items-center gap-2 ml-1">
                <span className="text-sm text-text-secondary font-mono">
                  {session.user?.name}
                </span>
                <button
                  onClick={() => signOut()}
                  className="text-text-muted hover:text-text-secondary transition-colors text-sm"
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => {
                setAuthMode('login');
                setShowAuth(true);
              }}
              className="btn-gold text-sm py-2 px-4"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

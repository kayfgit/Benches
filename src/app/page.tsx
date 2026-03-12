'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSession, signOut } from 'next-auth/react';
import { useAppState } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { AuthModal } from '@/components/AuthModal';
import { BenchDetailPanel, AddBenchPanel } from '@/components/Panels';
import { ForumPanel } from '@/components/Forum';
import { LoadingScreen } from '@/components/LoadingScreen';

const GlobeScene = dynamic(() => import('@/components/GlobeScene'), { ssr: false });

export default function Home() {
  const { data: session } = useSession();
  const { setBenches, setShowAuth, setAuthMode, showAddBench, setShowAddBench, setFlyTo, zoomLevel, setShouldResumeRotation, forumButtonPulse, setForumButtonPulse, showForum, setShowForum, selectedBench, setSelectedBench } = useAppState();
  const { showToast } = useToast();
  const [titleVisible, setTitleVisible] = useState(true);
  const [shakeButton, setShakeButton] = useState<'forum' | 'addBench' | null>(null);
  const [showArrow, setShowArrow] = useState(false);
  const signInRef = useRef<HTMLButtonElement>(null);
  const forumButtonRef = useRef<HTMLButtonElement>(null);

  // Reset forum button pulse after animation
  useEffect(() => {
    if (forumButtonPulse) {
      const timer = setTimeout(() => setForumButtonPulse(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [forumButtonPulse, setForumButtonPulse]);

  // Global Escape key handler to close panels
  // Note: Forum and Auth handle their own Escape key internally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only handle panels that don't have their own escape handlers
        // Forum handles escape internally (closes sub-panels first)
        // Auth modal handles its own escape
        if (!showForum && showAddBench) {
          setShowAddBench(false);
        } else if (!showForum && !showAddBench && selectedBench) {
          setSelectedBench(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showForum, showAddBench, setShowAddBench, selectedBench, setSelectedBench]);

  useEffect(() => {
    fetch('/api/benches')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setBenches(data);
      })
      .catch((err) => {
        console.error('Failed to fetch benches:', err);
        showToast('Failed to load benches', 'error');
      });
  }, [setBenches, showToast]);

  // Hide title when zoomed in
  useEffect(() => {
    setTitleVisible(zoomLevel > 2.5);
  }, [zoomLevel]);

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      setShouldResumeRotation(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFlyTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (error) => {
        let message = 'Unable to get your location';
        if (error.code === error.PERMISSION_DENIED) {
          message = 'Location access denied. Please enable location permissions.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = 'Location information unavailable.';
        } else if (error.code === error.TIMEOUT) {
          message = 'Location request timed out.';
        }
        alert(message);
        setShouldResumeRotation(true);
      }
    );
  };

  const handleDisabledClick = (button: 'forum' | 'addBench') => {
    if (session) return;

    // Trigger shake animation
    setShakeButton(button);
    setShowArrow(true);

    // Clear shake after animation
    setTimeout(() => setShakeButton(null), 500);

    // Hide arrow after delay
    setTimeout(() => setShowArrow(false), 2500);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-deep">
      <LoadingScreen />
      <GlobeScene />

      {/* Title - fades out when zoomed in */}
      <div
        className="fixed top-6 left-6 z-40 transition-all duration-500 select-none"
        style={{
          opacity: titleVisible ? 1 : 0,
          transform: titleVisible ? 'translateY(0)' : 'translateY(-20px)',
          pointerEvents: titleVisible ? 'auto' : 'none',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shadow-lg">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#17130e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 18h16" />
              <path d="M4 14h16" />
              <path d="M6 14V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" />
              <path d="M6 18v2" />
              <path d="M18 18v2" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-text-primary drop-shadow-lg">
            BenchFinder
          </h1>
        </div>
      </div>

      {/* Top right controls */}
      <div className="fixed top-6 right-6 z-[999] flex items-center gap-3 select-none">
        {/* Forum / Globe Toggle Button */}
        <button
          ref={forumButtonRef}
          onClick={() => session ? setShowForum(!showForum) : handleDisabledClick('forum')}
          className={`
            relative flex items-center gap-2 text-sm py-2.5 px-4 rounded-full shadow-lg
            transition-all duration-200 outline-none focus:outline-none
            ${session
              ? 'glass-strong hover:bg-elevated/80 text-text-primary cursor-pointer'
              : 'bg-surface/40 text-text-muted/50 cursor-default border border-ridge/30'
            }
            ${shakeButton === 'forum' ? 'animate-shake' : ''}
            ${forumButtonPulse ? 'animate-forum-pulse' : ''}
          `}
        >
          {showForum ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="hidden sm:inline">Globe</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <path d="M8 10h8" />
                <path d="M8 14h4" />
              </svg>
              <span className="hidden sm:inline">Forum</span>
            </>
          )}
        </button>

        {/* Add Bench Button */}
        <button
          onClick={() => session ? setShowAddBench(true) : handleDisabledClick('addBench')}
          className={`
            relative flex items-center gap-2 text-sm py-2.5 px-4 rounded-full shadow-lg
            transition-all duration-200 outline-none focus:outline-none
            ${session
              ? 'glass-strong hover:bg-elevated/80 text-text-primary cursor-pointer'
              : 'bg-surface/40 text-text-muted/50 cursor-default border border-ridge/30'
            }
            ${shakeButton === 'addBench' ? 'animate-shake' : ''}
          `}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="hidden sm:inline">Add Bench</span>
        </button>

        {/* Arrow pointing to Sign In */}
        {!session && showArrow && (
          <div className="absolute top-full right-0 mt-2 flex items-center gap-2 animate-bounce-subtle">
            <span className="text-xs text-gold font-medium whitespace-nowrap">Sign in first</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gold rotate-[-45deg]">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        )}

        {/* Sign In / User */}
        {session ? (
          <div className="flex items-center gap-3 ml-1">
            <div className="glass rounded-full px-4 py-2.5 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gold/30 to-gold-light/30 flex items-center justify-center">
                <span className="text-xs font-semibold text-gold">
                  {session.user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm text-text-secondary font-medium hidden sm:inline">
                {session.user?.name}
              </span>
              <button
                onClick={() => signOut()}
                className="text-text-muted hover:text-text-primary transition-colors text-sm ml-1 outline-none focus:outline-none"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={signInRef}
            onClick={() => {
              setAuthMode('login');
              setShowAuth(true);
            }}
            className={`
              btn-gold text-sm py-2.5 px-5 rounded-full shadow-lg
              flex items-center gap-2 transition-all outline-none focus:outline-none
              ${showArrow ? 'ring-2 ring-gold/50 ring-offset-2 ring-offset-deep scale-105' : ''}
            `}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            <span>Sign In</span>
          </button>
        )}
      </div>

      {/* Near Me - bottom center */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
        <button
          onClick={handleNearMe}
          className="glass-strong rounded-full px-6 py-3.5 flex items-center gap-3 shadow-xl hover:bg-elevated/80 transition-all group border border-ridge/30 outline-none focus:outline-none select-none"
          title="Find benches near you"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold/20 to-gold-light/20 flex items-center justify-center group-hover:from-gold/30 group-hover:to-gold-light/30 transition-all">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gold"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
            </svg>
          </div>
          <span className="text-sm font-medium text-text-primary">Near Me</span>
        </button>
      </div>

      <BenchDetailPanel />
      <AddBenchPanel />
      <AuthModal />
      <ForumPanel />

      {/* Shake animation styles */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 1s ease-in-out infinite;
        }
        @keyframes forum-pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(201, 148, 90, 0.7); }
          30% { transform: scale(1.15); box-shadow: 0 0 20px 10px rgba(201, 148, 90, 0.4); }
          60% { transform: scale(1.05); box-shadow: 0 0 10px 5px rgba(201, 148, 90, 0.2); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(201, 148, 90, 0); }
        }
        .animate-forum-pulse {
          animation: forum-pulse 1s ease-out;
        }
      `}</style>
    </main>
  );
}

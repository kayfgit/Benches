'use client';

import { useEffect, useState } from 'react';
import { useAppState } from '@/lib/store';

export function LoadingScreen() {
  const { globeReady } = useAppState();
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (globeReady) {
      // Start fade out
      setFadeOut(true);
      // Remove from DOM after animation
      const timer = setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(timer);
    }
  }, [globeReady]);

  if (!visible) return null;

  return (
    <div
      className={`
        fixed inset-0 z-[9999] flex flex-col items-center justify-center
        transition-opacity duration-500 ease-out
        ${fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'}
      `}
      style={{
        background: 'radial-gradient(ellipse at 50% 45%, #2e261e 0%, #1f1a13 40%, #17130e 80%)',
      }}
    >
      {/* Animated globe silhouette */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#3a2e24] to-[#2a221a] shadow-2xl relative overflow-hidden">
          {/* Rotating highlight */}
          <div
            className="absolute inset-0 rounded-full animate-globe-spin"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(201, 148, 90, 0.15) 50%, transparent 100%)',
            }}
          />
          {/* Atmospheric glow */}
          <div
            className="absolute -inset-2 rounded-full"
            style={{
              background: 'radial-gradient(circle, transparent 40%, rgba(201, 148, 90, 0.1) 70%, transparent 100%)',
            }}
          />
        </div>
        {/* Orbit ring */}
        <div className="absolute inset-[-8px] rounded-full border border-gold/20 animate-pulse" />
      </div>

      {/* Logo and text */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shadow-lg">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#17130e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 18h16" />
            <path d="M4 14h16" />
            <path d="M6 14V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" />
            <path d="M6 18v2" />
            <path d="M18 18v2" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-wide text-text-primary">
          BenchFinder
        </h1>
      </div>

      {/* Loading indicator */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-gold/60 animate-bounce-dot" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-gold/60 animate-bounce-dot" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-gold/60 animate-bounce-dot" style={{ animationDelay: '300ms' }} />
        </div>
      </div>

      <style jsx>{`
        @keyframes globe-spin {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-globe-spin {
          animation: globe-spin 2s ease-in-out infinite;
        }
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        .animate-bounce-dot {
          animation: bounce-dot 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

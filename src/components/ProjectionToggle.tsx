'use client';

import { useAppState } from '@/lib/store';

export function ProjectionToggle() {
  const { morphFactor, setMorphFactor } = useAppState();
  const isFlat = morphFactor > 0.5;

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <button
        onClick={() => setMorphFactor(isFlat ? 0 : 1)}
        className="glass-strong rounded-full px-4 py-2.5 flex items-center gap-3 glow-gold hover:border-gold/40 transition-all group"
        title={isFlat ? 'Switch to Globe view' : 'Switch to Mercator view'}
      >
        {/* Globe icon */}
        <div className="relative w-5 h-5">
          {/* Globe */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className={`absolute inset-0 transition-all duration-500 ${
              isFlat ? 'opacity-40 scale-90' : 'opacity-100 scale-100 text-gold'
            }`}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>

        {/* Slider track */}
        <div className="relative w-10 h-5 rounded-full bg-deep border border-ridge">
          <div
            className="absolute top-0.5 w-4 h-4 rounded-full bg-gradient-to-br from-gold to-gold-light transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{ left: isFlat ? 'calc(100% - 18px)' : '2px' }}
          />
        </div>

        {/* Map icon */}
        <div className="relative w-5 h-5">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`absolute inset-0 transition-all duration-500 ${
              isFlat ? 'opacity-100 scale-100 text-gold' : 'opacity-40 scale-90'
            }`}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
            <path d="M9 3v18" />
            <path d="M15 3v18" />
          </svg>
        </div>
      </button>
    </div>
  );
}

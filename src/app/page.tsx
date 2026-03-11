'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAppState } from '@/lib/store';
import { Navbar } from '@/components/Navbar';
import { AuthModal } from '@/components/AuthModal';
import { BenchDetailPanel, AddBenchPanel } from '@/components/Panels';

const GlobeScene = dynamic(() => import('@/components/GlobeScene'), { ssr: false });

export default function Home() {
  const { setBenches, benches } = useAppState();

  useEffect(() => {
    fetch('/api/benches')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setBenches(data);
      })
      .catch(() => {});
  }, [setBenches]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-deep">
      <GlobeScene />
      <Navbar />

      {/* Bench count badge */}
      <div className="fixed top-[68px] left-5 z-30 animate-fade-in">
        <div className="glass rounded-full px-3 py-1.5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gold animate-pulse-slow" />
          <span className="text-xs font-mono text-text-secondary">
            {benches.length} bench{benches.length !== 1 ? 'es' : ''} worldwide
          </span>
        </div>
      </div>

      <BenchDetailPanel />
      <AddBenchPanel />
      <AuthModal />

      {/* Bottom attribution */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-30">
        <span className="text-[10px] font-mono text-text-muted/40 tracking-wider uppercase">
          BenchFinder
        </span>
      </div>
    </main>
  );
}

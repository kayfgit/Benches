'use client';

import { useState, FormEvent, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useAppState } from '@/lib/store';
import type { Bench } from '@/types';

/* ─── Bench Detail Panel ────────────────────── */

export function BenchDetailPanel() {
  const { selectedBench, setSelectedBench, setFlyTo } = useAppState();
  if (!selectedBench) return null;

  const coords = `${selectedBench.latitude.toFixed(4)}, ${selectedBench.longitude.toFixed(4)}`;
  const dateStr = new Date(selectedBench.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="fixed left-4 bottom-4 top-20 z-40 w-[340px] max-w-[calc(100vw-2rem)] flex">
      <div className="glass-strong rounded-2xl overflow-hidden flex flex-col animate-slide-right w-full glow-gold">
        {/* Header */}
        <div className="relative p-5 pb-3 flex-shrink-0">
          <button
            onClick={() => setSelectedBench(null)}
            className="absolute top-4 right-4 text-text-muted hover:text-text-secondary transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <h3 className="font-display text-2xl font-semibold text-text-primary pr-8 leading-tight">
            {selectedBench.name}
          </h3>

          {selectedBench.country && (
            <span className="inline-block mt-2 text-xs font-mono text-gold bg-gold/10 px-2 py-0.5 rounded-full">
              {selectedBench.country}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {/* Photos */}
          {selectedBench.photos.length > 0 && (
            <div className="photo-grid">
              {selectedBench.photos.map((photo) => (
                <div
                  key={photo.id}
                  className="aspect-square rounded-lg overflow-hidden bg-surface"
                >
                  <img
                    src={photo.url}
                    alt={selectedBench.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Description */}
          <p className="text-text-secondary text-sm leading-relaxed">
            {selectedBench.description}
          </p>

          {/* Meta */}
          <div className="space-y-2 pt-2 border-t border-ridge/50">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="font-mono">{coords}</span>
              <button
                onClick={() =>
                  setFlyTo({ lat: selectedBench.latitude, lng: selectedBench.longitude })
                }
                className="ml-auto text-gold hover:text-gold-light text-xs transition-colors"
              >
                Fly to
              </button>
            </div>

            {selectedBench.altitude && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M8 3l4 8 5-5 2 4H2l6-7z" />
                </svg>
                <span className="font-mono">{selectedBench.altitude}m elevation</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>
                Added by <span className="text-text-secondary">{selectedBench.userName}</span>
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <span>{dateStr}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Add Bench Panel ───────────────────────── */

export function AddBenchPanel() {
  const { data: session } = useSession();
  const {
    showAddBench,
    setShowAddBench,
    pickingLocation,
    setPickingLocation,
    pickedLocation,
    setPickedLocation,
    addBench,
  } = useAppState();

  const [benchName, setBenchName] = useState('');
  const [description, setDescription] = useState('');
  const [country, setCountry] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!showAddBench || !session) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    setError('');

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        setPhotos((prev) => [...prev, data.url]);
      }
    } catch {
      setError('Photo upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pickedLocation) {
      setError('Click on the globe to pick a location');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/benches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: benchName,
          description,
          latitude: pickedLocation.lat,
          longitude: pickedLocation.lng,
          country,
          photoUrls: photos,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create bench');
      }

      const bench: Bench = await res.json();
      addBench(bench);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bench');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setShowAddBench(false);
    setPickingLocation(false);
    setPickedLocation(null);
    setBenchName('');
    setDescription('');
    setCountry('');
    setPhotos([]);
    setError('');
  };

  return (
    <div className="fixed right-4 bottom-4 top-20 z-40 w-[380px] max-w-[calc(100vw-2rem)] flex">
      <div className="glass-strong rounded-2xl overflow-hidden flex flex-col animate-slide-right w-full glow-gold">
        {/* Header */}
        <div className="p-5 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-2xl font-semibold text-text-primary">
              Add a Bench
            </h3>
            <button
              onClick={close}
              className="text-text-muted hover:text-text-secondary transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-text-muted text-sm mt-1">
            Share a bench with a beautiful view
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Location picker */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
              Location
            </label>
            {pickedLocation ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-sage-light bg-sage/10 px-3 py-1.5 rounded-lg">
                  {pickedLocation.lat.toFixed(4)}, {pickedLocation.lng.toFixed(4)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPickingLocation(true);
                    setPickedLocation(null);
                  }}
                  className="text-xs text-text-muted hover:text-text-secondary"
                >
                  Re-pick
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPickingLocation(true)}
                className={`btn-ghost w-full text-left text-sm ${
                  pickingLocation
                    ? 'border-sage text-sage-light'
                    : ''
                }`}
              >
                {pickingLocation
                  ? 'Click on the globe to set location...'
                  : 'Pick location on globe'}
              </button>
            )}
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
              Bench Name
            </label>
            <input
              type="text"
              value={benchName}
              onChange={(e) => setBenchName(e.target.value)}
              className="input-field"
              placeholder="e.g. Sunset Overlook Bench"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field min-h-[80px] resize-none"
              placeholder="What makes this bench special? Describe the view..."
              required
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
              Country
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="input-field"
              placeholder="e.g. Switzerland"
            />
          </div>

          {/* Photo upload */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
              Photos
            </label>
            <input
              type="file"
              ref={fileRef}
              onChange={handleFileUpload}
              accept="image/*"
              multiple
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-ghost w-full text-sm"
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload Photos'}
            </button>
            {photos.length > 0 && (
              <div className="photo-grid mt-2">
                {photos.map((url, i) => (
                  <div key={i} className="aspect-square rounded-lg overflow-hidden bg-surface relative group">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-deep/80 text-text-muted hover:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || !pickedLocation}
            className="btn-gold w-full"
          >
            {submitting ? 'Adding...' : 'Add Bench'}
          </button>
        </form>
      </div>
    </div>
  );
}

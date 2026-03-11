'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useAppState } from '@/lib/store';
import type { Bench } from '@/types';

/* ─── Bench Detail Panel ────────────────────── */

export function BenchDetailPanel() {
  const { selectedBench, setSelectedBench, setFlyTo, removeBench } = useAppState();
  const [deleting, setDeleting] = useState(false);

  if (!selectedBench) return null;

  const coords = `${selectedBench.latitude.toFixed(4)}, ${selectedBench.longitude.toFixed(4)}`;
  const dateStr = new Date(selectedBench.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/benches/${selectedBench.id}`, { method: 'DELETE' });
      if (res.ok) {
        removeBench(selectedBench.id);
        setSelectedBench(null);
      }
    } catch {
      // Ignore errors
    } finally {
      setDeleting(false);
    }
  };

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

          {/* Directions */}
          {selectedBench.directions && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                How to get there
              </div>
              <p className="text-text-secondary text-sm leading-relaxed">
                {selectedBench.directions}
              </p>
            </div>
          )}

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

          {/* Delete button for testing */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full mt-4 py-2 px-4 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {deleting ? 'Removing...' : 'Remove Bench'}
          </button>
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
    setForumButtonPulse,
    setTransitioningBenchId,
  } = useAppState();

  const [benchName, setBenchName] = useState('');
  const [description, setDescription] = useState('');
  const [directions, setDirections] = useState('');
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [isOcean, setIsOcean] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [shakeFields, setShakeFields] = useState<Set<string>>(new Set());
  const [successAnimation, setSuccessAnimation] = useState<'collapse' | 'square' | 'circle' | 'fly' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape key cancels location picking
  useEffect(() => {
    if (!pickingLocation) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPickingLocation(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pickingLocation, setPickingLocation]);

  // Auto-detect location from coordinates
  useEffect(() => {
    if (!pickedLocation) {
      setDetectedCountry(null);
      setIsOcean(false);
      return;
    }

    const detectLocation = async () => {
      setDetectingLocation(true);
      setIsOcean(false);
      setDetectedCountry(null);

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${pickedLocation.lat}&lon=${pickedLocation.lng}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();

        if (data.error || !data.address) {
          // Likely ocean or uninhabited area
          setIsOcean(true);
          setDetectedCountry(null);
        } else {
          const addr = data.address;
          // Build location string: Country, State/Province, City
          const parts: string[] = [];
          if (addr.country) parts.push(addr.country);
          if (addr.state || addr.region || addr.province) {
            parts.push(addr.state || addr.region || addr.province);
          }
          if (addr.city || addr.town || addr.village || addr.municipality) {
            parts.push(addr.city || addr.town || addr.village || addr.municipality);
          }
          setDetectedCountry(parts.length > 0 ? parts.join(', ') : null);
          setIsOcean(false);
        }
      } catch {
        // Network error - don't show ocean warning, just no location
        setDetectedCountry(null);
      } finally {
        setDetectingLocation(false);
      }
    };

    detectLocation();
  }, [pickedLocation]);

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

  // Check if form is valid
  const isFormValid = pickedLocation && benchName.trim() && description.trim() && photos.length > 0;

  // Handle clicking disabled submit button - shake empty fields
  const handleDisabledClick = () => {
    const emptyFields = new Set<string>();
    if (!pickedLocation) emptyFields.add('location');
    if (!benchName.trim()) emptyFields.add('name');
    if (!description.trim()) emptyFields.add('description');
    if (photos.length === 0) emptyFields.add('photos');

    setShakeFields(emptyFields);
    setTimeout(() => setShakeFields(new Set()), 500);
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
          directions,
          latitude: pickedLocation.lat,
          longitude: pickedLocation.lng,
          country: detectedCountry || '',
          photoUrls: photos,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create bench');
      }

      const bench: Bench = await res.json();
      addBench(bench);

      // Set transitioning bench for pin animation
      setTransitioningBenchId(bench.id);

      // Start success animation sequence
      // Phase 1: Collapse to 60x60 square (width faster than height)
      setSuccessAnimation('collapse');

      // Phase 2: Already square, now round the corners
      setTimeout(() => {
        setSuccessAnimation('square');
      }, 700);

      // Phase 3: Square becomes circle with bench icon
      setTimeout(() => {
        setSuccessAnimation('circle');
      }, 900);

      // Phase 4: Fly to forum button (north-northwest)
      setTimeout(() => {
        setSuccessAnimation('fly');
      }, 1300);

      // Clear transitioning state so bench marker appears
      setTimeout(() => {
        setTransitioningBenchId(null);
      }, 1550);

      // Trigger forum button pulse and close panel
      setTimeout(() => {
        setForumButtonPulse(true);
        setSuccessAnimation(null);
        closeWithoutAnimation();
      }, 1650);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bench');
      setSubmitting(false);
    }
  };

  const closeWithoutAnimation = () => {
    setShowAddBench(false);
    setPickingLocation(false);
    setPickedLocation(null);
    setBenchName('');
    setDescription('');
    setDirections('');
    setDetectedCountry(null);
    setIsOcean(false);
    setPhotos([]);
    setError('');
    setSubmitting(false);
    setSuccessAnimation(null);
  };

  const close = () => {
    setShowAddBench(false);
    setPickingLocation(false);
    setPickedLocation(null);
    setBenchName('');
    setDescription('');
    setDirections('');
    setDetectedCountry(null);
    setIsOcean(false);
    setPhotos([]);
    setError('');
    setSuccessAnimation(null);
  };

  // Show the animated bench icon circle during circle/fly phases
  const showBenchCircle = successAnimation === 'circle' || successAnimation === 'fly';

  // If we're showing the bench circle, render that instead
  if (showBenchCircle) {
    // Circle starts at panel center (right-4 + half panel width, vertically centered)
    // Then flies to forum button (top-right)
    const isFlying = successAnimation === 'fly';

    return (
      <div className="fixed inset-0 z-50 pointer-events-none">
        <div
          className="absolute flex items-center justify-center"
          style={{
            // Panel container: right-4 (16px), width 380px
            // Center of container: 16 + 190 = 206px from right
            // Vertical center: between top-20 (80px) and bottom-4 (16px) = roughly 50%
            // Subtract half the circle size (30px) to center it
            // Fly direction: more west (up and more to the left)
            right: isFlying ? 340 : (16 + 190 - 30),
            top: isFlying ? 30 : 'calc(50% - 30px + 32px)',
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #c9945a, #8a6535)',
            boxShadow: isFlying
              ? '0 0 0 rgba(201,148,90,0)'
              : '0 4px 20px rgba(201,148,90,0.5)',
            transform: isFlying ? 'scale(0.5)' : 'scale(1)',
            opacity: isFlying ? 0 : 1,
            transition: 'all 0.35s cubic-bezier(0.6, 0, 0.2, 1)',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#17130e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              opacity: isFlying ? 0 : 1,
              transition: 'opacity 0.1s ease-out',
            }}
          >
            <path d="M5 6h14" />
            <path d="M6 6v5" />
            <path d="M18 6v5" />
            <path d="M3 11h18" />
            <path d="M5 11v6" />
            <path d="M19 11v6" />
          </svg>
        </div>
      </div>
    );
  }

  // Panel animation styles for collapse and square phases
  const getPanelAnimationStyle = () => {
    // Base styles with explicit dimensions for transitions to work
    const baseHeight = 'calc(100vh - 96px)'; // Full panel height

    if (successAnimation === 'collapse') {
      return {
        width: '60px',
        height: '60px',
        padding: 0,
        overflow: 'hidden',
        borderRadius: '16px',
        // Both width and height collapse together to form a square
        transition: 'width 0.45s cubic-bezier(0.4, 0, 0.2, 1), height 0.5s cubic-bezier(0.3, 0, 0.2, 1), border-radius 0.5s ease-out, padding 0.1s ease-out',
      };
    }
    if (successAnimation === 'square') {
      return {
        width: '60px',
        height: '60px',
        padding: 0,
        overflow: 'hidden',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #c9945a, #8a6535)',
        transition: 'border-radius 0.15s ease-out, background 0.15s ease-out',
      };
    }
    // Default: explicit height so transitions work
    return {
      width: '380px',
      height: baseHeight,
    };
  };

  const panelAnimationStyle = getPanelAnimationStyle();

  const contentStyle = (successAnimation === 'collapse' || successAnimation === 'square')
    ? { opacity: 0, transition: 'opacity 0.08s ease-out' }
    : {};

  const isCollapsing = successAnimation === 'collapse' || successAnimation === 'square';

  return (
    <div className={`fixed right-4 bottom-4 top-20 z-40 max-w-[calc(100vw-2rem)] flex ${isCollapsing ? 'items-center justify-center w-[380px]' : ''}`}>
      <div
        ref={panelRef}
        className={`glass-strong rounded-2xl overflow-hidden flex flex-col animate-slide-right glow-gold relative ${successAnimation ? 'pointer-events-none' : ''}`}
        style={panelAnimationStyle}
      >
        {/* Bench icon that appears during collapse/square */}
        {isCollapsing && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#17130e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                opacity: successAnimation === 'square' ? 1 : 0,
                transition: 'opacity 0.15s ease-out',
              }}
            >
              <path d="M5 6h14" />
              <path d="M6 6v5" />
              <path d="M18 6v5" />
              <path d="M3 11h18" />
              <path d="M5 11v6" />
              <path d="M19 11v6" />
            </svg>
          </div>
        )}

        {/* Header */}
        <div className="p-5 pb-3 flex-shrink-0" style={contentStyle}>
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 pb-5 space-y-4" style={contentStyle}>
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Location picker */}
          <div className={shakeFields.has('location') ? 'animate-field-shake' : ''}>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
              Location <span className="text-gold">*</span>
            </label>
            {pickedLocation ? (
              <div className="space-y-2">
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
                {/* Country badge or ocean warning */}
                {detectingLocation ? (
                  <span className="text-xs text-text-muted">Detecting location...</span>
                ) : isOcean ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <path d="M12 9v4M12 17h.01" />
                    </svg>
                    This appears to be in the ocean or uninhabited area
                  </div>
                ) : detectedCountry ? (
                  <span className="inline-block text-xs font-mono text-gold bg-gold/10 px-2 py-0.5 rounded-full">
                    {detectedCountry}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1">
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
                    ? 'Waiting for location...'
                    : 'Pick location on globe'}
                </button>
                {pickingLocation && (
                  <p className="text-xs text-text-muted">
                    Click on the globe or press <kbd className="px-1 py-0.5 rounded bg-surface text-text-secondary">Esc</kbd> to cancel
                  </p>
                )}
              </div>
            )}
          </div>

          <div className={shakeFields.has('name') ? 'animate-field-shake' : ''}>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
              Bench Name <span className="text-gold">*</span>
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

          <div className={shakeFields.has('description') ? 'animate-field-shake' : ''}>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
              Description <span className="text-gold">*</span>
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
              How to get there <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={directions}
              onChange={(e) => setDirections(e.target.value)}
              className="input-field min-h-[60px] resize-none"
              placeholder="Describe the path, trail, or directions to reach this bench..."
            />
          </div>

          {/* Photo upload */}
          <div className={shakeFields.has('photos') ? 'animate-field-shake' : ''}>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
              Photos <span className="text-gold">*</span>
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

          <div className="relative">
            <button
              type="submit"
              disabled={submitting || !isFormValid}
              className="btn-gold w-full"
            >
              {submitting ? 'Adding...' : 'Add Bench'}
            </button>
            {/* Invisible overlay to catch clicks on disabled button */}
            {!isFormValid && !submitting && (
              <div
                className="absolute inset-0 cursor-pointer"
                onClick={handleDisabledClick}
              />
            )}
          </div>
        </form>
      </div>

      {/* Field shake animation styles */}
      <style jsx>{`
        @keyframes field-shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
          20%, 40%, 60%, 80% { transform: translateX(3px); }
        }
        :global(.animate-field-shake) {
          animation: field-shake 0.5s ease-in-out;
        }
        :global(.animate-field-shake) :global(input),
        :global(.animate-field-shake) :global(textarea),
        :global(.animate-field-shake) :global(button) {
          border-color: rgba(239, 68, 68, 0.5) !important;
          box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
        }
      `}</style>
    </div>
  );
}

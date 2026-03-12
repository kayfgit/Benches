'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useAppState } from '@/lib/store';
import { useToast } from '@/components/Toast';
import type { Bench, Issue } from '@/types';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'test@test.com';

// Helper for relative time
function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface BenchComment {
  id: string;
  content: string;
  userId: string;
  userName: string;
  createdAt: string;
}

/* ─── Photo Carousel ─────────────────────────── */
function PhotoCarousel({
  photos,
  onPhotoClick,
}: {
  photos: { id: string; url: string }[];
  onPhotoClick?: () => void;
}) {
  const [current, setCurrent] = useState(0);

  if (photos.length === 0) {
    return (
      <div
        className="aspect-[4/3] bg-gradient-to-br from-surface to-elevated flex items-center justify-center cursor-pointer"
        onClick={onPhotoClick}
      >
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-ridge">
          <path d="M4 18h16M4 14h16M6 14V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6M6 18v2M18 18v2" />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] bg-surface overflow-hidden group">
      <img
        src={photos[current].url}
        alt=""
        className="w-full h-full object-cover cursor-pointer"
        onClick={onPhotoClick}
      />

      {/* Navigation arrows */}
      {photos.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCurrent((current - 1 + photos.length) % photos.length);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-deep/60 backdrop-blur-sm flex items-center justify-center text-text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:bg-deep/80"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCurrent((current + 1) % photos.length);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-deep/60 backdrop-blur-sm flex items-center justify-center text-text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:bg-deep/80"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          {/* Dots indicator */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrent(i);
                }}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === current ? 'bg-white w-4' : 'bg-white/50 hover:bg-white/70'
                }`}
              />
            ))}
          </div>

          {/* Photo counter */}
          <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-deep/60 backdrop-blur-sm text-xs text-text-secondary">
            {current + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Vote Buttons ───────────────────────────── */
function VoteButtons({
  benchId,
  voteCount,
  userVote,
  onVoteChange,
  size = 'normal',
}: {
  benchId: string;
  voteCount: number;
  userVote: number;
  onVoteChange: (newCount: number, newVote: number) => void;
  size?: 'normal' | 'large';
}) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);

  const handleVote = async (e: React.MouseEvent, value: number) => {
    e.stopPropagation();
    if (!session || loading) return;
    setLoading(true);

    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benchId, value }),
      });

      if (res.ok) {
        const data = await res.json();
        onVoteChange(data.voteCount, data.userVote);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  const iconSize = size === 'large' ? 24 : 20;
  const btnClass = size === 'large' ? 'p-2' : 'p-1.5';

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => handleVote(e, userVote === 1 ? 0 : 1)}
        disabled={!session || loading}
        className={`${btnClass} rounded-xl transition-all ${
          userVote === 1
            ? 'text-gold bg-gold/20'
            : 'text-text-muted hover:text-gold hover:bg-gold/10'
        } disabled:opacity-50`}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={userVote === 1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M12 4l-8 8h5v8h6v-8h5z" />
        </svg>
      </button>
      <span className={`font-mono font-bold min-w-[3ch] text-center ${
        size === 'large' ? 'text-lg' : 'text-sm'
      } ${voteCount > 0 ? 'text-gold' : voteCount < 0 ? 'text-red-400' : 'text-text-muted'}`}>
        {voteCount}
      </span>
      <button
        onClick={(e) => handleVote(e, userVote === -1 ? 0 : -1)}
        disabled={!session || loading}
        className={`${btnClass} rounded-xl transition-all ${
          userVote === -1
            ? 'text-red-400 bg-red-400/20'
            : 'text-text-muted hover:text-red-400 hover:bg-red-400/10'
        } disabled:opacity-50`}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={userVote === -1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M12 20l8-8h-5V4H9v8H4z" />
        </svg>
      </button>
    </div>
  );
}

/* ─── Bench Post Card (Twitter/Reddit style) ─── */
function BenchPostCard({
  bench,
  onOpen,
  onFlyTo,
  onVoteChange,
}: {
  bench: Bench;
  onOpen: () => void;
  onFlyTo: () => void;
  onVoteChange: (benchId: string, newCount: number, newVote: number) => void;
}) {
  return (
    <article className="bg-surface/40 backdrop-blur-sm border border-ridge/30 rounded-2xl overflow-hidden hover:border-ridge/50 transition-colors">
      {/* Photo carousel - hero element */}
      <PhotoCarousel photos={bench.photos} onPhotoClick={onOpen} />

      {/* Content */}
      <div className="p-4">
        {/* Header: Title + Country badge */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3
            onClick={onOpen}
            className="font-display text-xl font-semibold text-text-primary cursor-pointer hover:text-gold transition-colors leading-tight"
          >
            {bench.name}
          </h3>
          {bench.country && (
            <span className="flex-shrink-0 text-xs font-mono text-gold bg-gold/10 px-2 py-1 rounded-lg">
              {bench.country.split(',')[0]}
            </span>
          )}
        </div>

        {/* Description - truncated */}
        <p className="text-text-secondary text-sm leading-relaxed line-clamp-2 mb-3">
          {bench.description}
        </p>

        {/* Footer: Meta + Actions */}
        <div className="flex items-center justify-between">
          {/* Meta info */}
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="font-medium">{bench.userName}</span>
            <span>{getTimeAgo(bench.createdAt)}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Comment count */}
            <button
              onClick={onOpen}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-text-muted hover:text-text-secondary hover:bg-surface/50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-xs font-medium">{bench.commentCount || 0}</span>
            </button>

            {/* Fly to */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFlyTo();
              }}
              className="p-1.5 rounded-xl text-text-muted hover:text-sage-light hover:bg-sage/10 transition-colors"
              title="View on globe"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </button>

            {/* Votes */}
            <VoteButtons
              benchId={bench.id}
              voteCount={bench.voteCount || 0}
              userVote={bench.userVote || 0}
              onVoteChange={(count, vote) => onVoteChange(bench.id, count, vote)}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

/* ─── Expanded Post Modal ────────────────────── */
function ExpandedPostModal({
  bench,
  onClose,
  onFlyTo,
  onVoteChange,
  onDelete,
  isAdmin,
}: {
  bench: Bench;
  onClose: () => void;
  onFlyTo: () => void;
  onVoteChange: (newCount: number, newVote: number) => void;
  onDelete: () => void;
  isAdmin: boolean;
}) {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [comments, setComments] = useState<BenchComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Load comments
  useEffect(() => {
    const load = async () => {
      setLoadingComments(true);
      try {
        const res = await fetch(`/api/comments?benchId=${bench.id}`);
        if (res.ok) setComments(await res.json());
      } catch {
        // Ignore
      } finally {
        setLoadingComments(false);
      }
    };
    load();
  }, [bench.id]);

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !session || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benchId: bench.id, content: newComment }),
      });

      if (res.ok) {
        const comment = await res.json();
        setComments([comment, ...comments]);
        setNewComment('');
      }
    } catch {
      showToast('Failed to post comment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/benches/${bench.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete();
        showToast('Bench deleted', 'success');
      }
    } catch {
      showToast('Failed to delete bench', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const hasPhotos = bench.photos.length > 0;
  const coords = `${bench.latitude.toFixed(4)}, ${bench.longitude.toFixed(4)}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto py-8 px-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-deep/90 backdrop-blur-md" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-surface/95 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl border border-ridge/30 animate-slide-up">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-deep/60 backdrop-blur-sm flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Photo gallery */}
        {hasPhotos && (
          <div className="relative aspect-video bg-deep">
            <img
              src={bench.photos[currentPhoto].url}
              alt={bench.name}
              className="w-full h-full object-cover"
            />
            {bench.photos.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentPhoto((currentPhoto - 1 + bench.photos.length) % bench.photos.length)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-deep/60 backdrop-blur-sm flex items-center justify-center text-text-primary hover:bg-deep/80 transition-colors"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <button
                  onClick={() => setCurrentPhoto((currentPhoto + 1) % bench.photos.length)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-deep/60 backdrop-blur-sm flex items-center justify-center text-text-primary hover:bg-deep/80 transition-colors"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {bench.photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPhoto(i)}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${i === currentPhoto ? 'bg-white w-6' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div ref={contentRef} className="p-6">
          {/* Title + Vote */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <h2 className="font-display text-2xl font-semibold text-text-primary leading-tight">
                {bench.name}
              </h2>
              <div className="flex items-center flex-wrap gap-3 mt-2 text-sm text-text-muted">
                {bench.country && (
                  <span className="text-gold bg-gold/10 px-2 py-0.5 rounded-lg text-xs font-mono">
                    {bench.country}
                  </span>
                )}
                <span>by <span className="text-text-secondary">{bench.userName}</span></span>
                <span>{getTimeAgo(bench.createdAt)}</span>
              </div>
            </div>
            <VoteButtons
              benchId={bench.id}
              voteCount={bench.voteCount || 0}
              userVote={bench.userVote || 0}
              onVoteChange={onVoteChange}
              size="large"
            />
          </div>

          {/* Description */}
          <p className="text-text-secondary leading-relaxed mb-6">
            {bench.description}
          </p>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {/* Coordinates */}
            <div className="p-3 rounded-xl bg-surface/50 border border-ridge/20">
              <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Coordinates
              </div>
              <div className="font-mono text-sm text-text-secondary">{coords}</div>
            </div>

            {/* Elevation */}
            {bench.altitude && (
              <div className="p-3 rounded-xl bg-surface/50 border border-ridge/20">
                <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3l4 8 5-5 2 4H2l6-7z" />
                  </svg>
                  Elevation
                </div>
                <div className="font-mono text-sm text-text-secondary">{bench.altitude}m</div>
              </div>
            )}

            {/* View on globe button */}
            <button
              onClick={onFlyTo}
              className="col-span-2 p-3 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center gap-2 text-gold hover:bg-gold/20 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="font-medium">View on Globe</span>
            </button>
          </div>

          {/* Directions */}
          {bench.directions && (
            <div className="p-4 rounded-xl bg-sage/10 border border-sage/20 mb-6">
              <h4 className="flex items-center gap-2 text-sm font-medium text-sage-light mb-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                How to get there
              </h4>
              <p className="text-sm text-text-secondary leading-relaxed">{bench.directions}</p>
            </div>
          )}

          {/* Admin delete */}
          {isAdmin && (
            <div className="mb-6">
              {showDeleteConfirm ? (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between">
                  <span className="text-sm text-red-400">Delete this bench permanently?</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 rounded-lg bg-surface/50 text-text-secondary text-sm hover:bg-surface/70 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete bench (admin)
                </button>
              )}
            </div>
          )}

          {/* Comments section */}
          <div className="border-t border-ridge/30 pt-6">
            <h3 className="flex items-center gap-2 font-medium text-text-primary mb-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Comments ({comments.length})
            </h3>

            {/* Comment form */}
            {session ? (
              <form onSubmit={handleSubmitComment} className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-surface/50 border border-ridge/30 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || submitting}
                  className="px-5 py-2.5 rounded-xl bg-gold text-deep font-medium text-sm hover:bg-gold-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? '...' : 'Post'}
                </button>
              </form>
            ) : (
              <p className="text-sm text-text-muted mb-4">Sign in to comment</p>
            )}

            {/* Comments list */}
            {loadingComments ? (
              <div className="text-center py-8 text-text-muted">Loading comments...</div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 text-text-muted">No comments yet. Be the first!</div>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="p-4 rounded-xl bg-surface/30 border border-ridge/20">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-gold/20 flex items-center justify-center text-xs font-semibold text-gold">
                        {comment.userName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-text-primary">{comment.userName}</span>
                      <span className="text-xs text-text-muted">{getTimeAgo(comment.createdAt)}</span>
                    </div>
                    <p className="text-sm text-text-secondary pl-9">{comment.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type ForumTab = 'all' | 'benches' | 'issues';

interface IssueData {
  id: string;
  title: string;
  content: string;
  type: 'bench' | 'bug';
  status: 'open' | 'resolved' | 'closed';
  userName: string;
  createdAt: string;
}

/* ─── Issue Card ─────────────────────────────── */
function IssueCard({ issue, onClick }: { issue: IssueData; onClick: () => void }) {
  return (
    <article
      onClick={onClick}
      className="p-4 bg-surface/40 backdrop-blur-sm border border-ridge/30 rounded-2xl hover:border-ridge/50 cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
          issue.type === 'bench' ? 'bg-gold/20 text-gold' : 'bg-sage/20 text-sage-light'
        }`}>
          {issue.type === 'bench' ? 'Bench' : 'Bug'}
        </span>
        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
          issue.status === 'open' ? 'bg-amber-500/20 text-amber-400' :
          issue.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
          'bg-text-muted/20 text-text-muted'
        }`}>
          {issue.status}
        </span>
      </div>
      <h4 className="font-medium text-text-primary mb-1">{issue.title}</h4>
      <p className="text-sm text-text-secondary line-clamp-2 mb-2">{issue.content}</p>
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span>{issue.userName}</span>
        <span>{getTimeAgo(issue.createdAt)}</span>
      </div>
    </article>
  );
}

/* ─── Main Forum Panel ───────────────────────── */
export function ForumPanel() {
  const { data: session } = useSession();
  const {
    showForum,
    setShowForum,
    setFlyTo,
    benches,
    setBenches,
    filteredBenches,
    searchQuery,
    setSearchQuery,
  } = useAppState();

  const [activeTab, setActiveTab] = useState<ForumTab>('all');
  const [expandedBench, setExpandedBench] = useState<Bench | null>(null);
  const [issues, setIssues] = useState<IssueData[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);

  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  // Load issues
  useEffect(() => {
    if (showForum && (activeTab === 'issues' || activeTab === 'all')) {
      const loadIssues = async () => {
        setLoadingIssues(true);
        try {
          const res = await fetch('/api/issues');
          if (res.ok) setIssues(await res.json());
        } catch {
          // Ignore
        } finally {
          setLoadingIssues(false);
        }
      };
      loadIssues();
    }
  }, [showForum, activeTab]);

  // Escape to close
  useEffect(() => {
    if (!showForum) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (expandedBench) {
          setExpandedBench(null);
        } else {
          setShowForum(false);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showForum, expandedBench, setShowForum]);

  const handleVoteChange = (benchId: string, newCount: number, newVote: number) => {
    setBenches(benches.map(b =>
      b.id === benchId ? { ...b, voteCount: newCount, userVote: newVote } : b
    ));
    if (expandedBench?.id === benchId) {
      setExpandedBench({ ...expandedBench, voteCount: newCount, userVote: newVote });
    }
  };

  const handleFlyTo = (bench: Bench) => {
    setFlyTo({ lat: bench.latitude, lng: bench.longitude });
    setShowForum(false);
    setExpandedBench(null);
  };

  const handleDelete = (benchId: string) => {
    setBenches(benches.filter(b => b.id !== benchId));
    setExpandedBench(null);
  };

  if (!showForum) return null;

  const tabs: { id: ForumTab; label: string; count: number; icon: JSX.Element }[] = [
    {
      id: 'all',
      label: 'All',
      count: benches.length + issues.length,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      id: 'benches',
      label: 'Benches',
      count: benches.length,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 18h16M4 14h16M6 14V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6M6 18v2M18 18v2" />
        </svg>
      ),
    },
    {
      id: 'issues',
      label: 'Issues',
      count: issues.length,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Main forum overlay */}
      <div className="fixed inset-0 z-50 flex bg-deep/95 backdrop-blur-xl animate-fade-in">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 bg-deep/50 border-r border-ridge/30 flex flex-col">
          {/* Title - matching globe view style */}
          <div className="p-6">
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
              <h1 className="font-display text-2xl font-semibold tracking-wide text-text-primary">
                BenchFinder
              </h1>
            </div>
          </div>

          {/* Navigation tabs */}
          <nav className="flex-1 px-4 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-gold/20 text-gold'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface/30'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span className="ml-auto text-xs bg-surface/50 px-2 py-0.5 rounded-full">
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>

          {/* Bottom info */}
          <div className="p-4 border-t border-ridge/30">
            <p className="text-xs text-text-muted text-center">
              Press <kbd className="px-1.5 py-0.5 rounded bg-surface/50 text-text-secondary">Esc</kbd> or use Globe button to close
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Search bar - top, aligned with top-right buttons (top-6 = 24px) */}
          <div className="flex-shrink-0 pt-6 pb-4 px-4 border-b border-ridge/30">
            <div className="max-w-xl mx-auto relative">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-12 pr-10 py-3 rounded-xl bg-surface/50 border border-ridge/30 text-sm text-text-primary placeholder:text-text-muted text-center focus:outline-none focus:border-gold/50 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Feed */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto space-y-4">
              {activeTab === 'all' ? (
                // All tab - interleaved feed sorted by date
                (() => {
                  // Filter issues by search query
                  const filteredIssues = searchQuery
                    ? issues.filter(i =>
                        i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        i.content.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                    : issues;

                  // Combine benches and issues into a single feed sorted by date
                  const feedItems: Array<{ type: 'bench'; data: Bench } | { type: 'issue'; data: IssueData }> = [
                    ...filteredBenches.map(b => ({ type: 'bench' as const, data: b })),
                    ...filteredIssues.map(i => ({ type: 'issue' as const, data: i })),
                  ].sort((a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime());

                  if (feedItems.length === 0) {
                    return (
                      <div className="text-center py-16">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-ridge mb-4">
                          <rect x="3" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="3" width="7" height="7" rx="1" />
                          <rect x="3" y="14" width="7" height="7" rx="1" />
                          <rect x="14" y="14" width="7" height="7" rx="1" />
                        </svg>
                        <h3 className="text-lg font-medium text-text-secondary mb-2">Nothing here yet</h3>
                        <p className="text-sm text-text-muted">Be the first to add a bench!</p>
                      </div>
                    );
                  }

                  return feedItems.map((item) =>
                    item.type === 'bench' ? (
                      <BenchPostCard
                        key={`bench-${item.data.id}`}
                        bench={item.data}
                        onOpen={() => setExpandedBench(item.data)}
                        onFlyTo={() => handleFlyTo(item.data)}
                        onVoteChange={handleVoteChange}
                      />
                    ) : (
                      <IssueCard
                        key={`issue-${item.data.id}`}
                        issue={item.data}
                        onClick={() => {/* TODO: open issue detail */}}
                      />
                    )
                  );
                })()
              ) : activeTab === 'benches' ? (
                filteredBenches.length === 0 ? (
                  <div className="text-center py-16">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-ridge mb-4">
                      <path d="M4 18h16M4 14h16M6 14V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6M6 18v2M18 18v2" />
                    </svg>
                    <h3 className="text-lg font-medium text-text-secondary mb-2">No benches found</h3>
                    <p className="text-sm text-text-muted">
                      {searchQuery ? 'Try a different search term' : 'Be the first to add a bench!'}
                    </p>
                  </div>
                ) : (
                  filteredBenches.map((bench) => (
                    <BenchPostCard
                      key={bench.id}
                      bench={bench}
                      onOpen={() => setExpandedBench(bench)}
                      onFlyTo={() => handleFlyTo(bench)}
                      onVoteChange={handleVoteChange}
                    />
                  ))
                )
              ) : (
                // Issues tab
                (() => {
                  const filteredIssues = searchQuery
                    ? issues.filter(i =>
                        i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        i.content.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                    : issues;

                  if (loadingIssues) {
                    return <div className="text-center py-16 text-text-muted">Loading issues...</div>;
                  }

                  if (filteredIssues.length === 0) {
                    return (
                      <div className="text-center py-16">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-ridge mb-4">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 8v4M12 16h.01" />
                        </svg>
                        <h3 className="text-lg font-medium text-text-secondary mb-2">No issues found</h3>
                        <p className="text-sm text-text-muted">
                          {searchQuery ? 'Try a different search term' : 'Everything looks good!'}
                        </p>
                      </div>
                    );
                  }

                  return filteredIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      onClick={() => {/* TODO: open issue detail */}}
                    />
                  ));
                })()
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Expanded post modal */}
      {expandedBench && (
        <ExpandedPostModal
          bench={expandedBench}
          onClose={() => setExpandedBench(null)}
          onFlyTo={() => handleFlyTo(expandedBench)}
          onVoteChange={(count, vote) => handleVoteChange(expandedBench.id, count, vote)}
          onDelete={() => handleDelete(expandedBench.id)}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}

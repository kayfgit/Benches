'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useAppState } from '@/lib/store';
import type { Bench, Comment, Issue } from '@/types';

// Admin email - configurable via environment variable
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'test@test.com';

type ForumTab = 'all' | 'benches' | 'issues';

interface BenchComment {
  id: string;
  content: string;
  userId: string;
  userName: string;
  createdAt: string;
}

interface IssueComment {
  id: string;
  content: string;
  userId: string;
  userName: string;
  createdAt: string;
}

/* ─── Vote Button Component ─────────────────── */
function VoteButtons({
  benchId,
  voteCount,
  userVote,
  onVoteChange,
  vertical = false
}: {
  benchId: string;
  voteCount: number;
  userVote: number;
  onVoteChange: (newCount: number, newVote: number) => void;
  vertical?: boolean;
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
      // Ignore errors
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex items-center gap-1 ${vertical ? 'flex-col' : ''}`}>
      <button
        onClick={(e) => handleVote(e, userVote === 1 ? 0 : 1)}
        disabled={!session || loading}
        className={`p-1.5 rounded-lg transition-colors ${
          userVote === 1
            ? 'text-gold bg-gold/20'
            : 'text-text-muted hover:text-gold hover:bg-gold/10'
        } disabled:opacity-50`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={userVote === 1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M12 4l-8 8h5v8h6v-8h5z" />
        </svg>
      </button>
      <span className={`text-sm font-mono min-w-[2ch] text-center font-semibold ${voteCount > 0 ? 'text-gold' : voteCount < 0 ? 'text-red-400' : 'text-text-muted'}`}>
        {voteCount}
      </span>
      <button
        onClick={(e) => handleVote(e, userVote === -1 ? 0 : -1)}
        disabled={!session || loading}
        className={`p-1.5 rounded-lg transition-colors ${
          userVote === -1
            ? 'text-red-400 bg-red-400/20'
            : 'text-text-muted hover:text-red-400 hover:bg-red-400/10'
        } disabled:opacity-50`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={userVote === -1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M12 20l8-8h-5V4H9v8H4z" />
        </svg>
      </button>
    </div>
  );
}

/* ─── Bench Card Component (Square with big photo) ─── */
function BenchCard({
  bench,
  onTitleClick,
  onCardClick,
  onVoteChange,
}: {
  bench: Bench;
  onTitleClick: () => void;
  onCardClick: () => void;
  onVoteChange: (benchId: string, newCount: number, newVote: number) => void;
}) {
  const timeAgo = getTimeAgo(bench.createdAt);
  const hasPhoto = bench.photos.length > 0;

  return (
    <div
      onClick={onCardClick}
      className="group relative aspect-square rounded-2xl overflow-hidden cursor-pointer bg-surface/60 border border-ridge/30 hover:border-gold/40 transition-all hover:scale-[1.02] hover:shadow-xl"
    >
      {/* Photo background */}
      {hasPhoto ? (
        <img
          src={bench.photos[0].url}
          alt={bench.name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-surface to-elevated flex items-center justify-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ridge">
            <path d="M4 18h16M4 14h16M6 14V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6M6 18v2M18 18v2" />
          </svg>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-deep/95 via-deep/30 to-transparent" />

      {/* Vote buttons - top right */}
      <div className="absolute top-3 right-3 glass rounded-xl p-1">
        <VoteButtons
          benchId={bench.id}
          voteCount={bench.voteCount || 0}
          userVote={bench.userVote || 0}
          onVoteChange={(count, vote) => onVoteChange(bench.id, count, vote)}
          vertical
        />
      </div>

      {/* Content overlay - bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        {/* Title - clickable to fly */}
        <h4
          onClick={(e) => { e.stopPropagation(); onTitleClick(); }}
          className="font-display text-lg font-semibold text-text-primary truncate cursor-pointer hover:text-gold transition-colors"
        >
          {bench.name}
        </h4>

        {/* Description */}
        <p className="text-sm text-text-secondary line-clamp-2 mt-1">
          {bench.description}
        </p>

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
          {bench.country && (
            <span className="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {bench.country.split(',')[0]}
            </span>
          )}
          <span>{bench.userName}</span>
          <span>{timeAgo}</span>
          {(bench.commentCount ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {bench.commentCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Issue Card Component ──────────────────── */
function IssueCard({ issue, onClick }: { issue: Issue; onClick: () => void }) {
  const timeAgo = getTimeAgo(issue.createdAt);

  return (
    <div
      onClick={onClick}
      className="p-4 rounded-xl bg-surface/50 border border-ridge/30 hover:border-gold/30 cursor-pointer transition-all hover:bg-surface/70"
    >
      <div className="flex items-start gap-3">
        <div className={`px-2 py-0.5 rounded text-xs font-medium ${
          issue.type === 'bench' ? 'bg-gold/20 text-gold' : 'bg-sage/20 text-sage-light'
        }`}>
          {issue.type === 'bench' ? 'Bench' : 'Bug'}
        </div>
        <div className={`px-2 py-0.5 rounded text-xs font-medium ${
          issue.status === 'open' ? 'bg-amber-500/20 text-amber-400' :
          issue.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
          'bg-text-muted/20 text-text-muted'
        }`}>
          {issue.status}
        </div>
      </div>

      <h4 className="font-medium text-text-primary mt-2">{issue.title}</h4>
      <p className="text-sm text-text-secondary line-clamp-2 mt-1">{issue.content}</p>

      <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
        <span>by {issue.userName}</span>
        <span>{timeAgo}</span>
      </div>
    </div>
  );
}

/* ─── Bench Detail View (with comments) ──────── */
function BenchDetailView({
  bench,
  onClose,
  onFlyTo,
  onVoteChange,
  isAdmin,
  onDelete,
}: {
  bench: Bench;
  onClose: () => void;
  onFlyTo: () => void;
  onVoteChange: (newCount: number, newVote: number) => void;
  isAdmin: boolean;
  onDelete: () => void;
}) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<BenchComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!isAdmin || deleting) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/benches/${bench.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        onDelete();
      }
    } catch {
      // Ignore
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [bench.id]);

  const loadComments = async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/comments?benchId=${bench.id}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingComments(false);
    }
  };

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
      // Ignore
    } finally {
      setSubmitting(false);
    }
  };

  const hasPhotos = bench.photos.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-deep/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-strong rounded-3xl overflow-hidden w-full max-w-3xl max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header with close */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button
            onClick={onFlyTo}
            className="glass rounded-full p-2 text-text-muted hover:text-gold transition-colors"
            title="Fly to bench"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="glass rounded-full p-2 text-text-muted hover:text-text-secondary transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Photo gallery */}
        {hasPhotos && (
          <div className="relative aspect-video bg-surface flex-shrink-0">
            <img
              src={bench.photos[currentPhoto].url}
              alt={bench.name}
              className="w-full h-full object-cover"
            />
            {bench.photos.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentPhoto((currentPhoto - 1 + bench.photos.length) % bench.photos.length)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 glass rounded-full p-2 text-text-primary hover:bg-elevated/80"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <button
                  onClick={() => setCurrentPhoto((currentPhoto + 1) % bench.photos.length)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 glass rounded-full p-2 text-text-primary hover:bg-elevated/80"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {bench.photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPhoto(i)}
                      className={`w-2 h-2 rounded-full transition-colors ${i === currentPhoto ? 'bg-gold' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-start gap-4">
            <VoteButtons
              benchId={bench.id}
              voteCount={bench.voteCount || 0}
              userVote={bench.userVote || 0}
              onVoteChange={onVoteChange}
              vertical
            />

            <div className="flex-1">
              <h2 className="font-display text-2xl font-semibold text-text-primary">{bench.name}</h2>

              <div className="flex items-center gap-3 mt-2 text-sm text-text-muted">
                {bench.country && (
                  <span className="flex items-center gap-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {bench.country}
                  </span>
                )}
                <span>by {bench.userName}</span>
                <span>{getTimeAgo(bench.createdAt)}</span>
              </div>

              <p className="text-text-secondary mt-4 leading-relaxed">{bench.description}</p>

              {bench.directions && (
                <div className="mt-4 p-3 rounded-xl bg-surface/50 border border-ridge/30">
                  <h4 className="text-sm font-medium text-text-muted mb-1">How to get there</h4>
                  <p className="text-sm text-text-secondary">{bench.directions}</p>
                </div>
              )}

              {/* Admin actions */}
              {isAdmin && (
                <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <h4 className="text-sm font-medium text-red-400 mb-3">Admin Actions</h4>
                  {confirmDelete ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-text-secondary">Are you sure?</span>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {deleting ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="px-4 py-2 rounded-lg bg-surface/50 text-text-secondary text-sm font-medium hover:bg-surface/70 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                      Delete Bench
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Comments section */}
          <div className="mt-8 border-t border-ridge/30 pt-6">
            <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Comments ({comments.length})
            </h3>

            {/* Comment form */}
            {session ? (
              <form onSubmit={handleSubmitComment} className="mb-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="input-field flex-1"
                  />
                  <button
                    type="submit"
                    disabled={!newComment.trim() || submitting}
                    className="btn-gold px-4 disabled:opacity-50"
                  >
                    Post
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-text-muted mb-4">Sign in to comment</p>
            )}

            {/* Comments list */}
            {loadingComments ? (
              <div className="text-center py-4 text-text-muted">Loading...</div>
            ) : comments.length === 0 ? (
              <div className="text-center py-4 text-text-muted">No comments yet. Be the first!</div>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="p-3 rounded-xl bg-surface/30">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-text-primary">{comment.userName}</span>
                      <span className="text-xs text-text-muted">{getTimeAgo(comment.createdAt)}</span>
                    </div>
                    <p className="text-sm text-text-secondary">{comment.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

/* ─── Issue Detail View (with comments) ──────── */
function IssueDetailView({
  issue,
  onClose,
  onStatusChange,
  isAdmin,
}: {
  issue: Issue;
  onClose: () => void;
  onStatusChange: (newStatus: 'open' | 'resolved' | 'closed') => void;
  isAdmin: boolean;
}) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadComments();
  }, [issue.id]);

  const loadComments = async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/issues/${issue.id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingComments(false);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !session || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/issues/${issue.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment }),
      });

      if (res.ok) {
        const comment = await res.json();
        setComments([comment, ...comments]);
        setNewComment('');
      }
    } catch {
      // Ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseIssue = async () => {
    if (!isAdmin || updating) return;
    setUpdating(true);

    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });

      if (res.ok) {
        onStatusChange('resolved');
      }
    } catch {
      // Ignore
    } finally {
      setUpdating(false);
    }
  };

  const handleReopenIssue = async () => {
    if (!isAdmin || updating) return;
    setUpdating(true);

    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'open' }),
      });

      if (res.ok) {
        onStatusChange('open');
      }
    } catch {
      // Ignore
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-deep/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-strong rounded-3xl overflow-hidden w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="p-6 border-b border-ridge/30 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                  issue.type === 'bench' ? 'bg-gold/20 text-gold' : 'bg-sage/20 text-sage-light'
                }`}>
                  {issue.type === 'bench' ? 'Bench Issue' : 'Bug Report'}
                </div>
                <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                  issue.status === 'open' ? 'bg-amber-500/20 text-amber-400' :
                  issue.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
                  'bg-text-muted/20 text-text-muted'
                }`}>
                  {issue.status}
                </div>
              </div>
              <h2 className="font-display text-2xl font-semibold text-text-primary">{issue.title}</h2>
              <div className="flex items-center gap-3 mt-2 text-sm text-text-muted">
                <span>by {issue.userName}</span>
                <span>{getTimeAgo(issue.createdAt)}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-secondary transition-colors p-2"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-text-secondary leading-relaxed whitespace-pre-wrap">{issue.content}</p>

          {/* Admin actions */}
          {isAdmin && (
            <div className="mt-6 p-4 rounded-xl bg-surface/30 border border-ridge/30">
              <h4 className="text-sm font-medium text-text-muted mb-3">Admin Actions</h4>
              <div className="flex gap-2">
                {issue.status === 'open' ? (
                  <button
                    onClick={handleCloseIssue}
                    disabled={updating}
                    className="btn-gold text-sm py-2 px-4 flex items-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {updating ? 'Closing...' : 'Close Issue'}
                  </button>
                ) : (
                  <button
                    onClick={handleReopenIssue}
                    disabled={updating}
                    className="btn-ghost text-sm py-2 px-4 flex items-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    {updating ? 'Reopening...' : 'Reopen Issue'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Comments section */}
          <div className="mt-8 border-t border-ridge/30 pt-6">
            <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Comments ({comments.length})
            </h3>

            {/* Comment form */}
            {session ? (
              <form onSubmit={handleSubmitComment} className="mb-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="input-field flex-1"
                  />
                  <button
                    type="submit"
                    disabled={!newComment.trim() || submitting}
                    className="btn-gold px-4 disabled:opacity-50"
                  >
                    Post
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-text-muted mb-4">Sign in to comment</p>
            )}

            {/* Comments list */}
            {loadingComments ? (
              <div className="text-center py-4 text-text-muted">Loading...</div>
            ) : comments.length === 0 ? (
              <div className="text-center py-4 text-text-muted">No comments yet. Be the first!</div>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="p-3 rounded-xl bg-surface/30">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-text-primary">{comment.userName}</span>
                      <span className="text-xs text-text-muted">{getTimeAgo(comment.createdAt)}</span>
                    </div>
                    <p className="text-sm text-text-secondary">{comment.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

/* ─── Create Issue Modal ────────────────────── */
function CreateIssueModal({ onClose, onCreated }: { onClose: () => void; onCreated: (issue: Issue) => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<'bench' | 'bug'>('bench');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, type }),
      });

      if (!res.ok) throw new Error('Failed to create issue');

      const issue = await res.json();
      onCreated(issue);
      onClose();
    } catch {
      setError('Failed to create issue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-deep/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-strong rounded-2xl p-6 w-full max-w-md glow-gold">
        <h3 className="font-display text-xl font-semibold text-text-primary mb-4">Report an Issue</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('bench')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                type === 'bench'
                  ? 'bg-gold/20 text-gold border border-gold/30'
                  : 'bg-surface/50 text-text-muted border border-ridge/30 hover:border-gold/30'
              }`}
            >
              Bench Issue
            </button>
            <button
              type="button"
              onClick={() => setType('bug')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                type === 'bug'
                  ? 'bg-sage/20 text-sage-light border border-sage/30'
                  : 'bg-surface/50 text-text-muted border border-ridge/30 hover:border-sage/30'
              }`}
            >
              Bug Report
            </button>
          </div>

          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="Issue title"
              required
            />
          </div>

          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input-field min-h-[100px] resize-none"
              placeholder="Describe the issue..."
              required
            />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-gold flex-1">
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Helper Functions ──────────────────────── */
function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─── Main Forum Panel (Fullscreen with left sidebar) ─── */
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
    filterCountry,
    setFilterCountry,
    sortBy,
    setSortBy,
    countries,
  } = useAppState();
  const [activeTab, setActiveTab] = useState<ForumTab>('all');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [showCreateIssue, setShowCreateIssue] = useState(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [selectedBenchDetail, setSelectedBenchDetail] = useState<Bench | null>(null);
  const [selectedIssueDetail, setSelectedIssueDetail] = useState<Issue | null>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  // Check if current user is admin
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  // Close country dropdown on click outside
  useEffect(() => {
    if (!showCountryDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target as Node)) {
        setShowCountryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCountryDropdown]);

  // Load issues when tab changes
  useEffect(() => {
    if (showForum && (activeTab === 'all' || activeTab === 'issues')) {
      loadIssues();
    }
  }, [showForum, activeTab]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedIssueDetail) {
          setSelectedIssueDetail(null);
        } else if (selectedBenchDetail) {
          setSelectedBenchDetail(null);
        } else {
          setShowForum(false);
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedBenchDetail, selectedIssueDetail, setShowForum]);

  const loadIssues = async () => {
    setLoadingIssues(true);
    try {
      const res = await fetch('/api/issues');
      if (res.ok) {
        const data = await res.json();
        setIssues(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingIssues(false);
    }
  };

  const handleVoteChange = (benchId: string, newCount: number, newVote: number) => {
    setBenches(benches.map(b =>
      b.id === benchId ? { ...b, voteCount: newCount, userVote: newVote } : b
    ));
  };

  const handleFlyToBench = (bench: Bench) => {
    setFlyTo({ lat: bench.latitude, lng: bench.longitude });
    setShowForum(false);
  };

  if (!showForum) return null;

  // Check if filters are active
  const hasActiveFilters = searchQuery || filterCountry || sortBy !== 'newest';

  const tabs: { id: ForumTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'all',
      label: 'All',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      id: 'benches',
      label: 'Benches',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 18h16M4 14h16M6 14V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6M6 18v2M18 18v2" />
        </svg>
      ),
    },
    {
      id: 'issues',
      label: 'Issues',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Fullscreen frosted overlay */}
      <div className="fixed inset-0 z-50 flex animate-fade-in">
        {/* Left Sidebar */}
        <div className="w-64 flex-shrink-0 bg-deep/70 backdrop-blur-xl border-r border-ridge/30 flex flex-col">
          {/* Logo/Title */}
          <div className="p-6 border-b border-ridge/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold to-gold-light flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#17130e" strokeWidth="2.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h2 className="font-display text-xl font-semibold text-text-primary">Forum</h2>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
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
                {tab.label}
                {tab.id === 'benches' && (
                  <span className="ml-auto text-xs bg-surface/50 px-2 py-0.5 rounded-full">
                    {hasActiveFilters ? `${filteredBenches.length}/${benches.length}` : benches.length}
                  </span>
                )}
                {tab.id === 'issues' && issues.length > 0 && (
                  <span className="ml-auto text-xs bg-surface/50 px-2 py-0.5 rounded-full">
                    {issues.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="p-4 border-t border-ridge/30">
            {session && activeTab === 'issues' && (
              <button
                onClick={() => setShowCreateIssue(true)}
                className="w-full btn-gold text-sm py-2.5 flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Report Issue
              </button>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 bg-deep/40 backdrop-blur-lg overflow-hidden flex flex-col">
          {/* Header bar */}
          <div className="flex-shrink-0 p-6 pb-4 border-b border-ridge/20">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-2xl font-semibold text-text-primary">
                  {activeTab === 'all' && 'All Posts'}
                  {activeTab === 'benches' && 'Benches'}
                  {activeTab === 'issues' && 'Issues'}
                </h3>
                <p className="text-sm text-text-muted mt-1">
                  {activeTab === 'all' && 'Recent activity and popular benches'}
                  {activeTab === 'benches' && (
                    hasActiveFilters
                      ? `${filteredBenches.length} of ${benches.length} benches`
                      : `${benches.length} benches discovered`
                  )}
                  {activeTab === 'issues' && 'Report problems with benches or bugs'}
                </p>
              </div>

              {/* Close button */}
              <button
                onClick={() => setShowForum(false)}
                className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface/30 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search and Filter - only for benches tab */}
            {(activeTab === 'all' || activeTab === 'benches') && (
              <div className="flex flex-wrap gap-3 items-center">
                {/* Search input */}
                <div className="relative flex-1 min-w-[200px]">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search benches..."
                    className="w-full pl-10 pr-8 py-2 rounded-xl bg-surface/50 border border-ridge/30 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Country filter */}
                <div className="relative" ref={countryDropdownRef}>
                  <button
                    onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                      filterCountry
                        ? 'bg-gold/20 text-gold border border-gold/30'
                        : 'bg-surface/50 text-text-muted hover:text-text-secondary border border-ridge/30'
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    {filterCountry || 'All Countries'}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`transition-transform ${showCountryDropdown ? 'rotate-180' : ''}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {showCountryDropdown && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-surface/95 backdrop-blur-xl rounded-xl border border-ridge/30 shadow-xl z-50 max-h-[300px] overflow-y-auto">
                      <button
                        onClick={() => {
                          setFilterCountry('');
                          setShowCountryDropdown(false);
                        }}
                        className={`w-full px-4 py-2.5 text-sm text-left hover:bg-elevated/50 transition-colors ${
                          !filterCountry ? 'text-gold' : 'text-text-secondary'
                        }`}
                      >
                        All Countries
                      </button>
                      {countries.map((country) => (
                        <button
                          key={country}
                          onClick={() => {
                            setFilterCountry(country);
                            setShowCountryDropdown(false);
                          }}
                          className={`w-full px-4 py-2.5 text-sm text-left hover:bg-elevated/50 transition-colors ${
                            filterCountry === country ? 'text-gold' : 'text-text-secondary'
                          }`}
                        >
                          {country}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sort options */}
                <div className="flex gap-1 p-1 rounded-xl bg-surface/30">
                  <button
                    onClick={() => setSortBy('newest')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      sortBy === 'newest' ? 'bg-gold/20 text-gold' : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    New
                  </button>
                  <button
                    onClick={() => setSortBy('popular')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      sortBy === 'popular' ? 'bg-gold/20 text-gold' : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    Top
                  </button>
                  <button
                    onClick={() => setSortBy('name')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      sortBy === 'name' ? 'bg-gold/20 text-gold' : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    A-Z
                  </button>
                </div>

                {/* Clear filters */}
                {hasActiveFilters && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterCountry('');
                      setSortBy('newest');
                    }}
                    className="text-xs text-gold hover:text-gold-light transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* All / Benches Tab - Grid of square cards */}
            {(activeTab === 'all' || activeTab === 'benches') && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredBenches.length === 0 ? (
                  <div className="col-span-full text-center py-20 text-text-muted">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-ridge">
                      <path d="M4 18h16M4 14h16M6 14V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6M6 18v2M18 18v2" />
                    </svg>
                    <p>No benches yet. Be the first to add one!</p>
                  </div>
                ) : (
                  filteredBenches.map((bench) => (
                    <BenchCard
                      key={bench.id}
                      bench={bench}
                      onTitleClick={() => handleFlyToBench(bench)}
                      onCardClick={() => setSelectedBenchDetail(bench)}
                      onVoteChange={handleVoteChange}
                    />
                  ))
                )}
              </div>
            )}

            {/* Issues Tab */}
            {activeTab === 'issues' && (
              <div className="max-w-2xl mx-auto space-y-3">
                {loadingIssues ? (
                  <div className="text-center py-20 text-text-muted">Loading...</div>
                ) : issues.length === 0 ? (
                  <div className="text-center py-20 text-text-muted">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-ridge">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9 9l6 6M15 9l-6 6" />
                    </svg>
                    <p>No issues reported yet.</p>
                  </div>
                ) : (
                  issues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      onClick={() => setSelectedIssueDetail(issue)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bench Detail View */}
      {selectedBenchDetail && (
        <BenchDetailView
          bench={selectedBenchDetail}
          onClose={() => setSelectedBenchDetail(null)}
          onFlyTo={() => {
            handleFlyToBench(selectedBenchDetail);
            setSelectedBenchDetail(null);
          }}
          onVoteChange={(newCount, newVote) => {
            handleVoteChange(selectedBenchDetail.id, newCount, newVote);
            setSelectedBenchDetail({ ...selectedBenchDetail, voteCount: newCount, userVote: newVote });
          }}
          isAdmin={isAdmin}
          onDelete={() => {
            setBenches(benches.filter(b => b.id !== selectedBenchDetail.id));
            setSelectedBenchDetail(null);
          }}
        />
      )}

      {/* Issue Detail View */}
      {selectedIssueDetail && (
        <IssueDetailView
          issue={selectedIssueDetail}
          onClose={() => setSelectedIssueDetail(null)}
          onStatusChange={(newStatus) => {
            setIssues(issues.map(i =>
              i.id === selectedIssueDetail.id ? { ...i, status: newStatus } : i
            ));
            setSelectedIssueDetail({ ...selectedIssueDetail, status: newStatus });
          }}
          isAdmin={isAdmin}
        />
      )}

      {/* Create Issue Modal */}
      {showCreateIssue && (
        <CreateIssueModal
          onClose={() => setShowCreateIssue(false)}
          onCreated={(issue) => setIssues([issue, ...issues])}
        />
      )}

      {/* Animations */}
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

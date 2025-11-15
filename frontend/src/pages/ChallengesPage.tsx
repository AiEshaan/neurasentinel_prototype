import { useEffect, useState } from 'react';
import { fetchChallenges, Challenge } from '../services/api';

const DEFAULT_PLAYER_ID = 'practice_player';
const DEFAULT_SESSION_ID = 'practice_session';

function statusLabel(status: Challenge['status']): string {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Not started';
}

export function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchChallenges(DEFAULT_PLAYER_ID, DEFAULT_SESSION_ID);
        setChallenges(data);
      } catch (err: any) {
        console.error(err);
        setError('Failed to load challenges.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <section className="challenges">
      <h2>Challenges</h2>
      <p style={{ color: '#9ca3af', marginBottom: '0.75rem' }}>
        Challenges update automatically based on your practice session stats.
      </p>
      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="challenges-grid">
        {challenges.map((c) => (
          <article key={c.id} className="challenge-card">
            <h3>{c.title}</h3>
            <p>{c.description}</p>
            <p>
              <strong>Target shot:</strong> {c.target_shot}
            </p>
            <p>
              <strong>Target accuracy:</strong> {(c.target_accuracy * 100).toFixed(0)}%
            </p>
            <p>
              <strong>Status:</strong> {statusLabel(c.status)}
            </p>
            {typeof c.current_accuracy === 'number' && (
              <p>
                <strong>Current accuracy:</strong> {(c.current_accuracy * 100).toFixed(1)}% (swings:{' '}
                {c.current_swings ?? 0})
              </p>
            )}
            <div
              style={{
                marginTop: '0.35rem',
                width: '100%',
                height: '6px',
                borderRadius: '999px',
                background: 'rgba(55, 65, 81, 0.8)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(1, c.progress)) * 100}%`,
                  height: '100%',
                  background: c.status === 'completed' ? '#22c55e' : '#6366f1',
                  transition: 'width 0.2s ease-out',
                }}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

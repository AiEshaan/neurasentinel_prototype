import { useEffect, useState } from 'react';
import { fetchPlayerHistory, PlayerHistoryResponse, ShotStats } from '../services/api';

function summarizeShots(shots: ShotStats[]): { avgAccuracy: number; avgSpeed: number } {
  if (shots.length === 0) {
    return { avgAccuracy: 0, avgSpeed: 0 };
  }
  let totalCount = 0;
  let sumAccuracy = 0;
  let sumSpeed = 0;
  for (const s of shots) {
    totalCount += s.count;
    sumAccuracy += s.average_confidence * s.count;
    sumSpeed += s.average_speed_mps * s.count;
  }
  return {
    avgAccuracy: totalCount ? sumAccuracy / totalCount : 0,
    avgSpeed: totalCount ? sumSpeed / totalCount : 0,
  };
}

export function ProfilePage() {
  const [playerId, setPlayerId] = useState('practice_player');
  const [history, setHistory] = useState<PlayerHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPlayerHistory(playerId);
        setHistory(data);
      } catch (err: any) {
        console.error(err);
        setError('Failed to load player history.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [playerId]);

  const sessions = history?.sessions ?? [];
  const latest = sessions[sessions.length - 1];
  const previous = sessions.length > 1 ? sessions[sessions.length - 2] : undefined;

  const latestSummary = latest ? summarizeShots(latest.shots) : { avgAccuracy: 0, avgSpeed: 0 };
  const prevSummary = previous ? summarizeShots(previous.shots) : { avgAccuracy: 0, avgSpeed: 0 };

  const accuracyDelta = latestSummary.avgAccuracy - prevSummary.avgAccuracy;
  const speedDelta = latestSummary.avgSpeed - prevSummary.avgSpeed;

  const PROFILE_STORAGE_KEY = 'neurasentinel_profile_meta';

  const [dominantHand, setDominantHand] = useState<'left' | 'right' | 'both'>('right');
  const [playStyle, setPlayStyle] = useState<'attacking' | 'defensive' | 'all-round'>('all-round');
  const [favoriteShot, setFavoriteShot] = useState<string>('');
  const [trainingGoal, setTrainingGoal] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        playerName?: string;
        dominantHand?: string;
        playStyle?: string;
        favoriteShot?: string;
        trainingGoal?: string;
      };
      if (data.playerName) {
        setPlayerId(data.playerName);
      }
      if (data.dominantHand === 'left' || data.dominantHand === 'right' || data.dominantHand === 'both') {
        setDominantHand(data.dominantHand);
      }
      if (
        data.playStyle === 'attacking' ||
        data.playStyle === 'defensive' ||
        data.playStyle === 'all-round'
      ) {
        setPlayStyle(data.playStyle);
      }
      if (typeof data.favoriteShot === 'string') {
        setFavoriteShot(data.favoriteShot);
      }
      if (typeof data.trainingGoal === 'string') {
        setTrainingGoal(data.trainingGoal);
      }
    } catch {
      // ignore malformed local storage
    }
  }, []);

  // Aggregate overall stats across all sessions
  let overallCount = 0;
  let overallAccSum = 0;
  const perShotAggregate: Record<string, { count: number; accSum: number }> = {};

  for (const session of sessions) {
    for (const shot of session.shots) {
      overallCount += shot.count;
      overallAccSum += shot.average_confidence * shot.count;
      const existing = perShotAggregate[shot.shot_type] ?? { count: 0, accSum: 0 };
      existing.count += shot.count;
      existing.accSum += shot.average_confidence * shot.count;
      perShotAggregate[shot.shot_type] = existing;
    }
  }

  const overallAccuracy = overallCount ? overallAccSum / overallCount : 0;

  let level: 'Amateur' | 'Veteran' | 'Pro' = 'Amateur';
  if (overallCount >= 400 && overallAccuracy >= 0.8) {
    level = 'Pro';
  } else if (overallCount >= 200 && overallAccuracy >= 0.65) {
    level = 'Veteran';
  } else {
    level = 'Amateur';
  }

  const levelColor =
    level === 'Pro' ? '#22c55e' : level === 'Veteran' ? '#3b82f6' : '#f97316';

  let bestShot: { shot_type: string; acc: number } | null = null;
  for (const [shotType, agg] of Object.entries(perShotAggregate)) {
    if (!agg.count) continue;
    const avgAcc = agg.accSum / agg.count;
    if (!bestShot || avgAcc > bestShot.acc) {
      bestShot = { shot_type: shotType, acc: avgAcc };
    }
  }

  function renderDeltaLabel(delta: number, unit: string): string {
    if (!previous) return 'no previous data';
    const pct = delta * 100;
    if (Math.abs(pct) < 1e-3) return `no change in ${unit}`;
    if (delta > 0) return `${pct.toFixed(1)}% increase in ${unit}`;
    return `${(-pct).toFixed(1)}% decrease in ${unit}`;
  }

  function renderAIFeedback(): string {
    if (!latest || latest.shots.length === 0) {
      return 'No swings recorded yet. Start a relaxed practice session on the dashboard and focus on smooth, consistent motion first.';
    }

    const primaryShot = [...latest.shots].sort((a, b) => b.count - a.count)[0];
    const accPct = latestSummary.avgAccuracy * 100;

    if (!previous) {
      if (accPct >= 90) {
        return `Amazing start! Your overall accuracy is ${accPct.toFixed(
          1,
        )}%. Keep reinforcing your ${primaryShot.shot_type} and slowly add more advanced variations when you feel comfortable.`;
      }
      if (accPct >= 75) {
        return `Great foundation. You already have solid accuracy—keep polishing your ${primaryShot.shot_type} by focusing on smooth swings and a relaxed grip.`;
      }
      return `You are at the beginning of a strong journey. Start with controlled ${primaryShot.shot_type} swings at lower speed and celebrate small improvements as your form gets more stable.`;
    }

    if (accuracyDelta > 0.02) {
      return `Nice improvement! Your average accuracy improved by ${(
        accuracyDelta * 100
      ).toFixed(1)}% compared to your last session. Whatever you changed is working—keep that routine and add a few fun challenges to push your stronger shots even further.`;
    }

    if (accuracyDelta < -0.02) {
      return `Today was a slightly tougher session: accuracy was ${(-accuracyDelta * 100).toFixed(
        1,
      )}% lower than last time, which is totally normal. Try a slower pace next time and focus on clean, repeatable ${primaryShot.shot_type} swings—your consistency will come back quickly.`;
    }

    return `Your accuracy is stable compared to your last session—a good sign of consistency. For your next session, set a small goal: pick one shot (e.g. ${primaryShot.shot_type}) and aim for a 5–10% accuracy boost while keeping your swing relaxed.`;
  }

  return (
    <section className="profile">
      <h2>Player Profile</h2>
      <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
        View your long-term progress, see your skill level, and get encouraging AI feedback on your training.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
          alignItems: 'center',
        }}
      >
        <label style={{ fontSize: '0.9rem' }}>
          <span style={{ marginRight: '0.4rem' }}>Player name:</span>
          <input
            type="text"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value.trim() || 'practice_player')}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid rgba(148, 163, 184, 0.7)',
              background: 'rgba(15, 23, 42, 0.9)',
              color: '#e5e7eb',
            }}
          />
        </label>
      </div>

      {loading && <p>Loading history...</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="result-card" style={{ marginBottom: '1rem' }}>
        <h3>Player Details</h3>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '0.75rem',
          }}
        >
          <label style={{ fontSize: '0.9rem' }}>
            <span style={{ marginRight: '0.4rem' }}>Dominant hand:</span>
            <select
              value={dominantHand}
              onChange={(e) => setDominantHand(e.target.value as 'left' | 'right' | 'both')}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid rgba(148, 163, 184, 0.7)',
                background: 'rgba(15, 23, 42, 0.9)',
                color: '#e5e7eb',
              }}
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
              <option value="both">Both</option>
            </select>
          </label>

          <label style={{ fontSize: '0.9rem' }}>
            <span style={{ marginRight: '0.4rem' }}>Play style:</span>
            <select
              value={playStyle}
              onChange={(e) => setPlayStyle(e.target.value as 'attacking' | 'defensive' | 'all-round')}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid rgba(148, 163, 184, 0.7)',
                background: 'rgba(15, 23, 42, 0.9)',
                color: '#e5e7eb',
              }}
            >
              <option value="attacking">Attacking</option>
              <option value="defensive">Defensive</option>
              <option value="all-round">All-round</option>
            </select>
          </label>

          <label style={{ fontSize: '0.9rem' }}>
            <span style={{ marginRight: '0.4rem' }}>Favourite shot:</span>
            <input
              type="text"
              value={favoriteShot}
              onChange={(e) => setFavoriteShot(e.target.value)}
              placeholder="e.g. Forehand, Smash"
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid rgba(148, 163, 184, 0.7)',
                background: 'rgba(15, 23, 42, 0.9)',
                color: '#e5e7eb',
                minWidth: '180px',
              }}
            />
          </label>
        </div>

        <label style={{ fontSize: '0.9rem', display: 'block' }}>
          <span style={{ marginRight: '0.4rem', display: 'block', marginBottom: '0.25rem' }}>
            Training goal:
          </span>
          <textarea
            value={trainingGoal}
            onChange={(e) => setTrainingGoal(e.target.value)}
            placeholder="e.g. Reach 80% accuracy on backhand blocks in 2 weeks."
            rows={3}
            style={{
              width: '100%',
              padding: '0.4rem 0.6rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(148, 163, 184, 0.7)',
              background: 'rgba(15, 23, 42, 0.9)',
              color: '#e5e7eb',
              resize: 'vertical',
            }}
          />
        </label>
      </div>

      {history && history.sessions.length > 0 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Player Overview</h3>
          <p>
            <strong>Name:</strong> {playerId}
          </p>
          <p>
            <strong>Level:</strong>{' '}
            <span
              style={{
                marginLeft: '0.25rem',
                padding: '0.1rem 0.6rem',
                borderRadius: '999px',
                border: '1px solid rgba(148, 163, 184, 0.7)',
                fontSize: '0.8rem',
                color: levelColor,
              }}
            >
              {level}
            </span>
          </p>
          <p>
            <strong>Total swings:</strong> {overallCount}
          </p>
          <p>
            <strong>Overall accuracy:</strong> {(overallAccuracy * 100).toFixed(1)}%
          </p>
          {bestShot && (
            <p>
              <strong>Best shot:</strong> {bestShot.shot_type} ({(bestShot.acc * 100).toFixed(1)}% accuracy)
            </p>
          )}
        </div>
      )}

      {history && history.sessions.length > 0 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>AI Feedback</h3>
          <p>{renderAIFeedback()}</p>
          {previous && (
            <>
              <p style={{ marginTop: '0.5rem', color: '#9ca3af' }}>
                Overall accuracy: { (latestSummary.avgAccuracy * 100).toFixed(1) }% (last session:{' '}
                {(prevSummary.avgAccuracy * 100).toFixed(1)}%)
              </p>
              <p style={{ marginTop: '0.25rem', color: '#9ca3af' }}>
                Accuracy trend: {renderDeltaLabel(accuracyDelta, 'accuracy')}
              </p>
              <p style={{ marginTop: '0.25rem', color: '#9ca3af' }}>
                Speed trend: {renderDeltaLabel(speedDelta, 'speed')}
              </p>
            </>
          )}
        </div>
      )}

      {history && history.sessions.length > 0 && (
        <div className="result-card">
          <h3>Session History</h3>
          {history.sessions.map((session, idx) => (
            <div key={idx} style={{ marginBottom: '0.75rem' }}>
              <p>
                <strong>Session:</strong> {session.session_id || '(no id)'}
              </p>
              <table className="leaderboard-table" style={{ marginTop: '0.25rem' }}>
                <thead>
                  <tr>
                    <th>Shot</th>
                    <th>Swings</th>
                    <th>Accuracy</th>
                    <th>Avg speed</th>
                  </tr>
                </thead>
                <tbody>
                  {session.shots.map((shot) => (
                    <tr key={shot.shot_type}>
                      <td>{shot.shot_type}</td>
                      <td>{shot.count}</td>
                      <td>{(shot.average_confidence * 100).toFixed(1)}%</td>
                      <td>{shot.average_speed_mps.toFixed(2)} m/s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {history && history.sessions.length === 0 && !loading && !error && (
        <p style={{ color: '#9ca3af' }}>
          No sessions found for this player yet. Record some swings on the dashboard first.
        </p>
      )}
    </section>
  );
}

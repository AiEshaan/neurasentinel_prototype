import { useEffect, useState } from 'react';
import { fetchPlayerHistory, PlayerHistoryResponse, ShotStats } from '../services/api';

function summarizeShots(shots: ShotStats[]): { avgAccuracy: number; avgSpeed: number } {
  if (shots.length === 0) return { avgAccuracy: 0, avgSpeed: 0 };
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

export function AnalyticsPage() {
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
        setError('Failed to load analytics.');
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

  // Aggregate overall stats across all sessions
  let overallCount = 0;
  let overallAccSum = 0;
  for (const session of sessions) {
    for (const shot of session.shots) {
      overallCount += shot.count;
      overallAccSum += shot.average_confidence * shot.count;
    }
  }
  const overallAccuracy = overallCount ? overallAccSum / overallCount : 0;

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
      <h2>AI Analytics</h2>
      <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
        Deep dive into your performance trends. Compare sessions and get encouraging AI feedback on how
        your game is evolving.
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

      {loading && <p>Loading analytics...</p>}
      {error && <p className="error-text">{error}</p>}

      {history && history.sessions.length > 0 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Overall Trends</h3>
          <p>
            <strong>Total sessions:</strong> {history.sessions.length}
          </p>
          <p>
            <strong>Total swings (all sessions):</strong> {overallCount}
          </p>
          <p>
            <strong>Overall accuracy:</strong> {(overallAccuracy * 100).toFixed(1)}%
          </p>
        </div>
      )}

      {history && history.sessions.length > 0 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>AI Feedback</h3>
          <p>{renderAIFeedback()}</p>
          {previous && (
            <>
              <p style={{ marginTop: '0.5rem', color: '#9ca3af' }}>
                Overall accuracy: {(latestSummary.avgAccuracy * 100).toFixed(1)}% (last session:{' '}
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

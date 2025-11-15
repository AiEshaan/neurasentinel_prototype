import { ChangeEvent, useEffect, useState } from 'react';
import { classifySwing, fetchSessionStats, ShotStats } from '../services/api';

const SHOTS = [
  'Forehand',
  'Backhand',
  'Smash',
  'Push',
  'Block',
  'Flick',
  'Serve',
  'Chop',
];

interface DashboardResult {
  shot_type: string;
  confidence: number;
  speed_mps: number;
  accuracy_score: number;
}

export function DashboardPage() {
  const [lastResult, setLastResult] = useState<DashboardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [shotStatsByType, setShotStatsByType] = useState<Record<string, ShotStats>>({});

  const DEFAULT_PLAYER_ID = 'practice_player';
  const DEFAULT_SESSION_ID = 'practice_session';

  async function refreshSessionStats() {
    try {
      const stats = await fetchSessionStats(DEFAULT_PLAYER_ID, DEFAULT_SESSION_ID);
      const map: Record<string, ShotStats> = {};
      for (const shot of stats.shots) {
        map[shot.shot_type] = shot;
      }
      setShotStatsByType(map);
    } catch (err) {
      // Stats are optional; ignore errors silently for now.
      console.error('Failed to load session stats', err);
    }
  }

  useEffect(() => {
    void refreshSessionStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shotStatsList = Object.values(shotStatsByType);
  let totalSwings = 0;
  let accWeightedSum = 0;
  let primaryShot: ShotStats | null = null;

  for (const stat of shotStatsList) {
    totalSwings += stat.count;
    accWeightedSum += stat.average_confidence * stat.count;
    if (!primaryShot || stat.count > primaryShot.count) {
      primaryShot = stat;
    }
  }

  const overallAccuracy = totalSwings ? accWeightedSum / totalSwings : 0;

  async function handleTestSwing() {
    setLoading(true);
    setError(null);
    try {
      // Simple synthetic swing payload for now; later this will come from BLE/real sensor stream.
      const samples = Array.from({ length: 40 }).map((_, i) => ({
        ax: Math.sin(i / 5) * 0.5,
        ay: Math.cos(i / 7) * 0.5,
        az: 1 + Math.sin(i / 9) * 0.3,
        gx: Math.sin(i / 4) * 100,
        gy: Math.cos(i / 6) * 80,
        gz: Math.sin(i / 3) * 120,
        t: i * 0.01,
      }));

      const response = await classifySwing({
        player_id: DEFAULT_PLAYER_ID,
        session_id: DEFAULT_SESSION_ID,
        sampling_rate_hz: 100,
        samples,
      });
      setLastResult(response.result);
      await refreshSessionStats();
    } catch (err: any) {
      console.error(err);
      setError('Failed to classify swing. Make sure the backend is running on port 8000.');
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  async function handleClassifyCsv() {
    if (!selectedFile) {
      setError('Please select a CSV file first.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const text = await selectedFile.text();
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length < 2) {
        throw new Error('CSV file has no data rows.');
      }

      const header = lines[0].split(',').map((h) => h.trim());
      const required = ['acc_x', 'acc_y', 'acc_z', 'gyro_x', 'gyro_y', 'gyro_z'];
      const idx: Record<string, number> = {};
      for (const col of required) {
        const i = header.indexOf(col);
        if (i === -1) {
          throw new Error(`CSV header missing required column: ${col}`);
        }
        idx[col] = i;
      }

      const samples = lines.slice(1).map((line, i) => {
        const parts = line.split(',');
        return {
          ax: parseFloat(parts[idx['acc_x']]),
          ay: parseFloat(parts[idx['acc_y']]),
          az: parseFloat(parts[idx['acc_z']]),
          gx: parseFloat(parts[idx['gyro_x']]),
          gy: parseFloat(parts[idx['gyro_y']]),
          gz: parseFloat(parts[idx['gyro_z']]),
          t: i * (1 / 200),
        };
      });

      if (samples.length === 0) {
        throw new Error('No valid samples parsed from CSV.');
      }

      const response = await classifySwing({
        player_id: DEFAULT_PLAYER_ID,
        session_id: DEFAULT_SESSION_ID,
        sampling_rate_hz: 200,
        samples,
      });
      setLastResult(response.result);
      await refreshSessionStats();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to classify CSV swing.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="dashboard">
      <h2>Practice Dashboard</h2>
      <p>Track your 8 core shots. Use the demo swing or upload a real swing CSV from your dataset.</p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={handleTestSwing} disabled={loading}>
          {loading ? 'Analyzing...' : 'Run Demo Swing'}
        </button>

        <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {selectedFile ? `Selected: ${selectedFile.name}` : 'Choose Swing CSV'}
        </label>

        <button className="btn btn-primary" onClick={handleClassifyCsv} disabled={loading}>
          {loading ? 'Analyzing...' : 'Classify Uploaded CSV'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

       {totalSwings > 0 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Session Summary</h3>
          <p>
            <strong>Total swings:</strong> {totalSwings}
          </p>
          <p>
            <strong>Average accuracy:</strong> {(overallAccuracy * 100).toFixed(1)}%
          </p>
          {primaryShot && (
            <p>
              <strong>Primary shot this session:</strong> {primaryShot.shot_type} ({(
                primaryShot.average_confidence * 100
              ).toFixed(1)}% accuracy)
            </p>
          )}
        </div>
      )}

      {lastResult && (
        <div className="result-card">
          <h3>Last Swing Result</h3>
          <p>
            <strong>Shot type:</strong> {lastResult.shot_type}
          </p>
          <p>
            <strong>Confidence:</strong> {(lastResult.confidence * 100).toFixed(1)}%
          </p>
          <p>
            <strong>Speed:</strong> {lastResult.speed_mps.toFixed(2)} m/s
          </p>
          <p>
            <strong>Accuracy score:</strong> {(lastResult.accuracy_score * 100).toFixed(1)}%
          </p>
        </div>
      )}

      <div className="shots-grid">
        {SHOTS.map((shot) => (
          <div key={shot} className="shot-card">
            <h4>{shot}</h4>
            {shotStatsByType[shot] ? (
              <>
                <p>
                  <strong>Swings:</strong> {shotStatsByType[shot].count}
                </p>
                <p>
                  <strong>Accuracy:</strong>{' '}
                  {(shotStatsByType[shot].average_confidence * 100).toFixed(1)}%
                </p>
                <p>
                  <strong>Avg speed:</strong>{' '}
                  {shotStatsByType[shot].average_speed_mps.toFixed(2)} m/s
                </p>
              </>
            ) : (
              <p>No swings recorded yet.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

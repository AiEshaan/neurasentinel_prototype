export interface SwingSamplePayload {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  t: number;
}

export interface SwingRequestPayload {
  player_id: string;
  session_id?: string;
  sampling_rate_hz: number;
  samples: SwingSamplePayload[];
}

export interface ClassificationResult {
  shot_type: string;
  confidence: number;
  speed_mps: number;
  accuracy_score: number;
}

export interface SwingResponsePayload {
  player_id: string;
  session_id?: string;
  result: ClassificationResult;
}

export interface LeaderboardEntry {
  player_id: string;
  score: number;
  rank: number;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  target_shot: string;
  target_accuracy: number;
  status: 'not_started' | 'in_progress' | 'completed';
  progress: number; // 0-1
  current_accuracy?: number | null;
  current_swings?: number | null;
}

export interface ShotStats {
  shot_type: string;
  count: number;
  average_confidence: number;
  average_speed_mps: number;
}

export interface SessionStatsResponse {
  player_id: string;
  session_id?: string;
  shots: ShotStats[];
}

export interface SessionSummary {
  session_id?: string;
  shots: ShotStats[];
}

export interface PlayerHistoryResponse {
  player_id: string;
  sessions: SessionSummary[];
}

// Typed loosely to avoid complaining about import.meta in non-Vite tooling.
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

async function handleResponse<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API error ${resp.status}: ${text}`);
  }
  return (await resp.json()) as T;
}

export async function classifySwing(payload: SwingRequestPayload): Promise<SwingResponsePayload> {
  const resp = await fetch(`${API_BASE_URL}/api/swing/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<SwingResponsePayload>(resp);
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const resp = await fetch(`${API_BASE_URL}/api/leaderboard`);
  return handleResponse<LeaderboardEntry[]>(resp);
}

export async function fetchChallenges(
  playerId?: string,
  sessionId?: string,
): Promise<Challenge[]> {
  const params = new URLSearchParams();
  if (playerId) params.append('player_id', playerId);
  if (sessionId) params.append('session_id', sessionId);
  const query = params.toString();
  const url = query
    ? `${API_BASE_URL}/api/challenges?${query}`
    : `${API_BASE_URL}/api/challenges`;
  const resp = await fetch(url);
  return handleResponse<Challenge[]>(resp);
}

export async function fetchSessionStats(
  playerId: string,
  sessionId?: string,
): Promise<SessionStatsResponse> {
  const params = new URLSearchParams({ player_id: playerId });
  if (sessionId) {
    params.append('session_id', sessionId);
  }
  const resp = await fetch(`${API_BASE_URL}/api/session-stats?${params.toString()}`);
  return handleResponse<SessionStatsResponse>(resp);
}

export async function fetchPlayerHistory(playerId: string): Promise<PlayerHistoryResponse> {
  const params = new URLSearchParams({ player_id: playerId });
  const resp = await fetch(`${API_BASE_URL}/api/player-history?${params.toString()}`);
  return handleResponse<PlayerHistoryResponse>(resp);
}

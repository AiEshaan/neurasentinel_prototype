from dataclasses import dataclass
from typing import List, Optional

import json
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ml_model import get_classifier


app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SwingSample(BaseModel):
    ax: float
    ay: float
    az: float
    gx: float
    gy: float
    gz: float
    t: float


class SwingRequest(BaseModel):
    player_id: str
    session_id: Optional[str] = None
    sampling_rate_hz: float
    samples: List[SwingSample]


class ClassificationResult(BaseModel):
    shot_type: str
    confidence: float
    speed_mps: float
    accuracy_score: float


class SwingResponse(BaseModel):
    player_id: str
    session_id: Optional[str] = None
    result: ClassificationResult


class LeaderboardEntry(BaseModel):
    player_id: str
    score: float
    rank: int


class Challenge(BaseModel):
    id: str
    title: str
    description: str
    target_shot: str
    target_accuracy: float
    status: str = "not_started"
    progress: float = 0.0
    current_accuracy: Optional[float] = None
    current_swings: Optional[int] = None


class ShotStats(BaseModel):
    shot_type: str
    count: int
    average_confidence: float
    average_speed_mps: float


class SessionStatsResponse(BaseModel):
    player_id: str
    session_id: Optional[str] = None
    shots: List[ShotStats]


class SessionSummary(BaseModel):
    session_id: Optional[str] = None
    shots: List[ShotStats]


class PlayerHistoryResponse(BaseModel):
    player_id: str
    sessions: List[SessionSummary]


@dataclass
class _ShotAccumulator:
    count: int = 0
    sum_confidence: float = 0.0
    sum_speed_mps: float = 0.0


_SESSION_STATS: dict = {}

_STATS_FILE = Path(__file__).resolve().parent / "data" / "session_stats.json"


def _load_session_stats() -> None:
    global _SESSION_STATS
    if not _STATS_FILE.exists():
        return
    data = json.loads(_STATS_FILE.read_text(encoding="utf-8"))
    restored: dict = {}
    for key_str, per_shot in data.items():
        player_id, session_id_raw = key_str.split("|", 1)
        session_id_val = session_id_raw or None
        inner: dict = {}
        for shot_type, acc_dict in per_shot.items():
            inner[shot_type] = _ShotAccumulator(
                count=int(acc_dict.get("count", 0)),
                sum_confidence=float(acc_dict.get("sum_confidence", 0.0)),
                sum_speed_mps=float(acc_dict.get("sum_speed_mps", 0.0)),
            )
        restored[(player_id, session_id_val)] = inner
    _SESSION_STATS = restored


def _save_session_stats() -> None:
    _STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
    serializable: dict = {}
    for (player_id, session_id), per_shot in _SESSION_STATS.items():
        key = f"{player_id}|{session_id or ''}"
        serializable[key] = {}
        for shot_type, acc in per_shot.items():
            serializable[key][shot_type] = {
                "count": acc.count,
                "sum_confidence": acc.sum_confidence,
                "sum_speed_mps": acc.sum_speed_mps,
            }
    _STATS_FILE.write_text(json.dumps(serializable), encoding="utf-8")


_load_session_stats()


def _update_session_stats(
    player_id: str,
    session_id: Optional[str],
    shot_type: str,
    confidence: float,
    speed_mps: float,
) -> None:
    key = (player_id, session_id)
    per_shot = _SESSION_STATS.get(key)
    if per_shot is None:
        per_shot = {}
        _SESSION_STATS[key] = per_shot
    acc = per_shot.get(shot_type)
    if acc is None:
        acc = _ShotAccumulator()
        per_shot[shot_type] = acc
    acc.count += 1
    acc.sum_confidence += float(confidence)
    acc.sum_speed_mps += float(speed_mps)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/swing/classify", response_model=SwingResponse)
async def classify_swing(payload: SwingRequest) -> SwingResponse:
    sensor_array = np.array(
        [[s.ax, s.ay, s.az, s.gx, s.gy, s.gz] for s in payload.samples],
        dtype=float,
    )
    accel_norm = 0.0
    if sensor_array.size > 0:
        accel = sensor_array[:, :3]
        accel_norm = float(np.linalg.norm(accel, axis=1).max())

    classifier = get_classifier()

    # Default stub prediction in case model is not ready or prediction fails
    shot_type = "Forehand"
    confidence = 0.75

    if classifier.is_ready and sensor_array.size > 0:
        try:
            shot_type, confidence = classifier.predict(sensor_array)
        except Exception:
            # Fall back to stub values if anything goes wrong
            pass

    accuracy_score = float(confidence)

    result = ClassificationResult(
        shot_type=shot_type,
        confidence=float(confidence),
        speed_mps=float(accel_norm),
        accuracy_score=float(accuracy_score),
    )

    _update_session_stats(
        player_id=payload.player_id,
        session_id=payload.session_id,
        shot_type=shot_type,
        confidence=confidence,
        speed_mps=accel_norm,
    )
    _save_session_stats()

    return SwingResponse(
        player_id=payload.player_id,
        session_id=payload.session_id,
        result=result,
    )


@app.get("/api/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard() -> List[LeaderboardEntry]:
    entries = [
        LeaderboardEntry(player_id="player_1", score=98.5, rank=1),
        LeaderboardEntry(player_id="player_2", score=92.0, rank=2),
        LeaderboardEntry(player_id="player_3", score=88.0, rank=3),
    ]
    return entries


@app.get("/api/session-stats", response_model=SessionStatsResponse)
async def get_session_stats(player_id: str, session_id: Optional[str] = None) -> SessionStatsResponse:
    key = (player_id, session_id)
    per_shot = _SESSION_STATS.get(key, {})

    shots: List[ShotStats] = []
    for shot_type, acc in per_shot.items():
        if acc.count <= 0:
            continue
        shots.append(
            ShotStats(
                shot_type=shot_type,
                count=acc.count,
                average_confidence=acc.sum_confidence / acc.count,
                average_speed_mps=acc.sum_speed_mps / acc.count,
            )
        )

    shots.sort(key=lambda s: s.shot_type)

    return SessionStatsResponse(player_id=player_id, session_id=session_id, shots=shots)


@app.get("/api/challenges", response_model=List[Challenge])
async def get_challenges(player_id: str = "practice_player", session_id: Optional[str] = "practice_session") -> List[Challenge]:
    base_challenges = [
        Challenge(
            id="c1",
            title="Forehand Accuracy",
            description="Hit 20 consistent forehands above 80% accuracy.",
            target_shot="Forehand",
            target_accuracy=0.8,
        ),
        Challenge(
            id="c2",
            title="Backhand Power",
            description="Perform 10 strong backhands with high racket speed.",
            target_shot="Backhand",
            target_accuracy=0.75,
        ),
    ]

    key = (player_id, session_id)
    per_shot = _SESSION_STATS.get(key, {})

    challenges: List[Challenge] = []
    for ch in base_challenges:
        stats = per_shot.get(ch.target_shot)
        if stats is None or stats.count <= 0:
            ch.status = "not_started"
            ch.progress = 0.0
            ch.current_accuracy = None
            ch.current_swings = 0
        else:
            current_acc = stats.sum_confidence / stats.count
            ch.current_accuracy = float(current_acc)
            ch.current_swings = int(stats.count)
            if current_acc >= ch.target_accuracy:
                ch.status = "completed"
                ch.progress = 1.0
            else:
                ch.status = "in_progress"
                ch.progress = float(max(0.0, min(1.0, current_acc / ch.target_accuracy)))
        challenges.append(ch)

    return challenges


@app.get("/api/player-history", response_model=PlayerHistoryResponse)
async def get_player_history(player_id: str) -> PlayerHistoryResponse:
    sessions: List[SessionSummary] = []

    for (pid, sid), per_shot in _SESSION_STATS.items():
        if pid != player_id:
            continue
        shots: List[ShotStats] = []
        for shot_type, acc in per_shot.items():
            if acc.count <= 0:
                continue
            shots.append(
                ShotStats(
                    shot_type=shot_type,
                    count=acc.count,
                    average_confidence=acc.sum_confidence / acc.count,
                    average_speed_mps=acc.sum_speed_mps / acc.count,
                )
            )
        shots.sort(key=lambda s: s.shot_type)
        sessions.append(SessionSummary(session_id=sid, shots=shots))

    # Sort sessions by session_id (None last)
    sessions.sort(key=lambda s: (s.session_id is None, s.session_id or ""))

    return PlayerHistoryResponse(player_id=player_id, sessions=sessions)


@app.get("/api/model-metrics")
async def get_model_metrics() -> dict:
    metrics_path = Path(__file__).resolve().parent / "models" / "neurasentinel_metrics.json"
    if not metrics_path.exists():
        raise HTTPException(status_code=404, detail="Model metrics not found. Train the model first.")
    try:
        data = json.loads(metrics_path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"Failed to read metrics: {exc}")
    return data

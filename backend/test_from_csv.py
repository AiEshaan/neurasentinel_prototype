from __future__ import annotations

import argparse
from pathlib import Path
from typing import List, Dict, Any

import pandas as pd
import requests


def load_csv_as_samples(csv_path: Path, sampling_rate_hz: float = 200.0) -> List[Dict[str, Any]]:
    df = pd.read_csv(csv_path)
    required_cols = ["acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z"]
    if not set(required_cols).issubset(df.columns):
        raise ValueError(f"CSV {csv_path} missing required columns: {required_cols}")

    dt = 1.0 / sampling_rate_hz if sampling_rate_hz > 0 else 0.0
    samples: List[Dict[str, Any]] = []
    for i, row in df.iterrows():
        samples.append(
            {
                "ax": float(row["acc_x"]),
                "ay": float(row["acc_y"]),
                "az": float(row["acc_z"]),
                "gx": float(row["gyro_x"]),
                "gy": float(row["gyro_y"]),
                "gz": float(row["gyro_z"]),
                "t": float(i * dt),
            }
        )
    return samples


def main() -> None:
    parser = argparse.ArgumentParser(description="Test /api/swing/classify using a CSV swing file.")
    parser.add_argument(
        "csv_path",
        type=str,
        help="Path to swing CSV (e.g. ../data_sets/Backhand/Backhand_001.csv)",
    )
    parser.add_argument(
        "--player-id",
        type=str,
        default="test_player",
        help="Player ID to send in request.",
    )
    parser.add_argument(
        "--session-id",
        type=str,
        default="csv_test_session",
        help="Session ID to send in request.",
    )
    parser.add_argument(
        "--sampling-rate",
        type=float,
        default=200.0,
        help="Sampling rate in Hz used to approximate timestamps.",
    )
    parser.add_argument(
        "--url",
        type=str,
        default="http://127.0.0.1:8000/api/swing/classify",
        help="Classification endpoint URL.",
    )

    args = parser.parse_args()

    csv_path = Path(args.csv_path).resolve()
    if not csv_path.exists():
        raise SystemExit(f"CSV file not found: {csv_path}")

    samples = load_csv_as_samples(csv_path, sampling_rate_hz=args.sampling_rate)
    if not samples:
        raise SystemExit("No samples loaded from CSV (file may be empty)")

    payload = {
        "player_id": args.player_id,
        "session_id": args.session_id,
        "sampling_rate_hz": args.sampling_rate,
        "samples": samples,
    }

    print(f"Sending {len(samples)} samples from {csv_path} to {args.url}...")
    resp = requests.post(args.url, json=payload)
    print(f"Status: {resp.status_code}")

    try:
        data = resp.json()
    except Exception:
        print("Non-JSON response:")
        print(resp.text)
        return

    print("Response JSON:")
    print(data)

    result = data.get("result") or {}
    shot_type = result.get("shot_type")
    confidence = result.get("confidence")
    speed = result.get("speed_mps")

    print("\nParsed result:")
    print(f"  Shot type   : {shot_type}")
    print(f"  Confidence  : {confidence}")
    print(f"  Speed (m/s) : {speed}")


if __name__ == "__main__":
    main()

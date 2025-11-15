<<<<<<< HEAD
# NeuraSentinel

AI-powered table tennis coach on your desktop. Attach an Arduino + IMU to your bat, stream swings to your PC, and get real-time shot classification and training feedback.

---

## 1. Project structure

```text
Neura_Sentinel/
├─ backend/
│  ├─ main.py              # FastAPI backend (API + session stats + challenges)
│  ├─ train_cnn.py         # CNN training script (IMU time-series classifier)
│  ├─ ml_model.py          # Model loading + inference helper
│  ├─ requirements.txt     # Python dependencies
│  ├─ models/
│  │  ├─ neurasentinel_cnn.h5          # Trained Keras model
│  │  ├─ scaler_mean.npy, scaler_scale.npy  # Normalization parameters
│  │  └─ neurasentinel_metrics.json    # Test metrics & confusion matrix
│  └─ data/
│     └─ session_stats.json            # Per-player/session shot stats
│
├─ data_sets/
│  ├─ Forehand/Forehand_XXX.csv
│  ├─ Backhand/Backhand_XXX.csv
│  ├─ Smash/Smash_XXX.csv
│  └─ ... (Push, Block, Flick, Serve, Chop)
│     # Each CSV: acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z
│
└─ frontend/
   ├─ package.json          # React + Vite app
   ├─ tsconfig.json
   └─ src/
      ├─ main.tsx
      ├─ App.tsx
      ├─ styles.css
      ├─ components/NavBar.tsx
      └─ pages/
         ├─ HeroPage.tsx
         ├─ DashboardPage.tsx
         ├─ ProfilePage.tsx
         ├─ AnalyticsPage.tsx
         ├─ ChallengesPage.tsx
         ├─ LeaderboardPage.tsx
         └─ DevicePage.tsx
```

---

## 2. Backend setup

### 2.1. Install dependencies

From the `backend` folder:

```bash
pip install -r requirements.txt
```

Python 3.10+ is recommended.

### 2.2. Train (or retrain) the CNN

The CNN is trained from the CSV files under `data_sets/`.

From `backend`:

```bash
python train_cnn.py
```

This will:

- Load time-series IMU data from `data_sets/<ShotName>/*.csv`.
- Split into train/val/test per class (with augmentation to 150 samples per shot).
- Train a 1D CNN on `(T, 6)` sequences.
- Save:
  - `models/neurasentinel_cnn.h5` (model)
  - `models/scaler_mean.npy`, `models/scaler_scale.npy` (normalization)
  - `models/neurasentinel_metrics.json` (test accuracy, confusion matrix, per-class metrics)

You should see a test accuracy printed in the console.

### 2.3. Run the backend API

From `backend`:

```bash
uvicorn main:app --reload --port 8000
```

Then open:

- `http://127.0.0.1:8000/docs` – FastAPI Swagger UI

Key endpoints:

- `GET /health` – health check
- `POST /api/swing/classify` – classify one swing
- `GET /api/leaderboard` – placeholder leaderboard data
- `GET /api/challenges` – dynamic challenges (status & progress based on stats)
- `GET /api/session-stats` – per-shot stats for a given player/session
- `GET /api/player-history` – all sessions for a player
- `GET /api/model-metrics` – test metrics + confusion matrix for the last trained model

---

## 3. Frontend setup

### 3.1. Install dependencies

From the `frontend` folder:

```bash
npm install
```

Node 18+ is recommended.

### 3.2. Run the dev server

From `frontend`:

```bash
npm run dev
```

By default Vite runs on `http://localhost:5173`.

Make sure the backend is running on `http://127.0.0.1:8000` so the frontend can call the API.

---

## 4. Frontend pages

### 4.1. Hero page (`/`)

- Tagline: **"AI-powered Table Tennis Coach on your Desktop"**.
- Explains the idea and provides main call-to-actions:
  - **Start Practicing** (Dashboard)
  - **View AI Analytics** (Analytics)
  - **Connect Device** (Device)

### 4.2. Dashboard (`/dashboard`)

- **Run Demo Swing** – generates a synthetic swing and sends it to `/api/swing/classify`.
- **Upload Swing CSV** – lets you upload a CSV from `data_sets` and classify it.
- **Session Summary** card (for default `practice_player` / `practice_session`):
  - Total swings this session
  - Average accuracy
  - Primary shot this session
- **Shot grid**:
  - One tile per shot (Forehand, Backhand, Smash, Push, Block, Flick, Serve, Chop)
  - Shows swings, accuracy, and average speed for each shot.

### 4.3. Profile (`/profile`)

- **Player name** (used as ID for stats).
- **Player details** (stored in localStorage):
  - Dominant hand (right/left/both)
  - Play style (attacking/defensive/all-round)
  - Favourite shot (text)
  - Training goal (text)
- **Player Overview**:
  - Level: Amateur / Veteran / Pro
    - Amateur: overall accuracy < 65% or total swings < 200
    - Veteran: 65–80% and total swings ≥ 200
    - Pro: accuracy ≥ 80% and total swings ≥ 400
  - Total swings
  - Overall accuracy
  - Best shot (highest accuracy)
- **AI Feedback**:
  - Encouraging coaching messages based on latest vs previous session.
- **Session History**:
  - Per-session tables with shot, swings, accuracy, avg speed.

### 4.4. AI Analytics (`/analytics`)

- **Player name** selector (same as Profile).
- **Overall Trends** card:
  - Total sessions
  - Total swings across history
  - Overall accuracy
- **AI Feedback**:
  - Encouraging text comparing latest vs previous session.
- **Session History**:
  - Same per-session breakdown as Profile; focused on analysis.

### 4.5. Challenges (`/challenges`)

Challenges are dynamic, based on `practice_player` / `practice_session` stats:

- Each challenge includes:
  - Title, description
  - Target shot
  - Target accuracy
  - Status: **not_started**, **in_progress**, **completed**
  - Progress bar based on current accuracy / target accuracy
  - Current accuracy & swings

Example challenges:

- **Forehand Accuracy** – target shot `Forehand`, target accuracy 80%.
- **Backhand Power** – target shot `Backhand`, target accuracy 75%.

### 4.6. Device (`/device`)

- **Purpose**: connect to your Arduino/IMU bat via Web Bluetooth and stream sensor data.
- Uses Web Bluetooth APIs (`navigator.bluetooth.requestDevice`).
- Placeholder service/characteristic UUIDs:

  ```ts
  const IMU_SERVICE_UUID = '0000ffff-0000-1000-8000-00805f9b34fb';
  const IMU_CHARACTERISTIC_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';
  ```

  Replace these with the **actual UUIDs** from your Arduino firmware.

- Sensor notifications are assumed to encode 6 `float32` values:

  ```ts
  ax, ay, az, gx, gy, gz
  ```

  Adjust parsing to your real packet format.

- Captured samples are buffered; you can send the last N samples to `/api/swing/classify` as a swing.

> Note: Web Bluetooth works best in Chrome/Edge on desktop, usually on `https` or `http://localhost`.

### 4.7. Leaderboard (`/leaderboard`)

- Currently shows a **"coming soon"** message.
- Backend `/api/leaderboard` returns placeholder entries.

---

## 5. Data format for swings

### 5.1. CSV files

Each CSV in `data_sets/<Shot>/*.csv` has header:

```text
acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z
```

Each row is one timestamp.

### 5.2. API payload for classification

`POST /api/swing/classify` takes:

```json
{
  "player_id": "practice_player",
  "session_id": "practice_session",
  "sampling_rate_hz": 200.0,
  "samples": [
    {
      "ax": -0.45,
      "ay": -0.85,
      "az": 0.93,
      "gx": -208.3,
      "gy": 27.2,
      "gz": 78.1,
      "t": 0.0
    }
    // ... more samples
  ]
}
```

Response:

```json
{
  "player_id": "practice_player",
  "session_id": "practice_session",
  "result": {
    "shot_type": "Backhand",
    "confidence": 0.95,
    "speed_mps": 4.12,
    "accuracy_score": 0.95
  }
}
```

---

## 6. Extending the system

- **Model tuning**:
  - Adjust CNN layers in `build_model`.
  - Re-run `python train_cnn.py` to regenerate model + metrics.
- **New challenges**:
  - Add entries to the base `base_challenges` list in `main.py`.
- **Multi-player support**:
  - Use different `player_id` values in API calls, then view them in Profile/Analytics.
- **BLE integration**:
  - Replace the UUIDs and packet parsing in `DevicePage.tsx` once Arduino firmware is finalized.

---

## 7. Known limitations

- Leaderboard is static/placeholder.
- Device/BLE page uses placeholder UUIDs and a guessed packet format.
- No authentication or user accounts yet; `player_id` is a simple string key.

Despite these, NeuraSentinel already supports a full offline loop:

1. Collect swing data with IMU and save as CSV.
2. Train the CNN and inspect model metrics.
3. Classify swings from CSV or BLE.
4. Track per-session and long-term progress via Dashboard, Profile, Analytics, and Challenges.
=======
# neurasentinel_prototype
>>>>>>> 937b18c0d6592565584a4a7ce3dc510f1387598d

from pathlib import Path
from typing import Tuple

import numpy as np
import tensorflow as tf


CLASS_NAMES = [
    "Forehand",
    "Backhand",
    "Smash",
    "Push",
    "Block",
    "Flick",
    "Serve",
    "Chop",
]

FIXED_LENGTH = 128

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODEL_DIR / "neurasentinel_cnn.h5"
MEAN_PATH = MODEL_DIR / "scaler_mean.npy"
SCALE_PATH = MODEL_DIR / "scaler_scale.npy"


def pad_or_truncate(sample: np.ndarray, length: int = FIXED_LENGTH) -> np.ndarray:
    t, d = sample.shape
    if t == length:
        return sample
    if t > length:
        return sample[:length, :]
    pad_width = ((0, length - t), (0, 0))
    return np.pad(sample, pad_width=pad_width, mode="constant", constant_values=0.0)


class SwingClassifier:
    def __init__(self) -> None:
        self.model: tf.keras.Model | None = None
        self.mean: np.ndarray | None = None
        self.scale: np.ndarray | None = None

        if MODEL_PATH.exists() and MEAN_PATH.exists() and SCALE_PATH.exists():
            self.model = tf.keras.models.load_model(MODEL_PATH)
            self.mean = np.load(MEAN_PATH)
            self.scale = np.load(SCALE_PATH)

    @property
    def is_ready(self) -> bool:
        return self.model is not None and self.mean is not None and self.scale is not None

    def _preprocess(self, sensor_array: np.ndarray) -> np.ndarray:
        if sensor_array.ndim != 2 or sensor_array.shape[1] != 6:
            raise ValueError("Expected sensor_array shape (T, 6)")

        x = pad_or_truncate(sensor_array)
        if self.mean is None or self.scale is None:
            raise RuntimeError("Scaler parameters not loaded")
        x = (x - self.mean) / self.scale
        return x[np.newaxis, :, :]

    def predict(self, sensor_array: np.ndarray) -> Tuple[str, float]:
        if not self.is_ready:
            raise RuntimeError("Model is not ready")
        if not isinstance(sensor_array, np.ndarray):
            sensor_array = np.array(sensor_array, dtype=float)

        x = self._preprocess(sensor_array)
        probs = self.model.predict(x, verbose=0)[0]
        idx = int(np.argmax(probs))
        label = CLASS_NAMES[idx]
        confidence = float(probs[idx])
        return label, confidence


_classifier = SwingClassifier()


def get_classifier() -> SwingClassifier:
    return _classifier

import os
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import tensorflow as tf
from tensorflow.keras import layers, models


DATA_DIR = Path(__file__).resolve().parent.parent / "data_sets"
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
N_CLASSES = len(CLASS_NAMES)
TARGET_PER_CLASS = 150
TEST_TARGET_PER_CLASS = 63  # 63 * 8 = 504 (> 500)
VAL_TARGET_PER_CLASS = 27
TRAIN_TARGET_PER_CLASS = TARGET_PER_CLASS - TEST_TARGET_PER_CLASS - VAL_TARGET_PER_CLASS

FIXED_LENGTH = 128  # time steps per swing after padding/truncation
RANDOM_STATE = 42


def load_class_samples(class_name: str) -> List[np.ndarray]:
    class_dir = DATA_DIR / class_name
    samples: List[np.ndarray] = []
    if not class_dir.exists():
        raise FileNotFoundError(f"Directory not found for class {class_name}: {class_dir}")

    for csv_path in sorted(class_dir.glob("*.csv")):
        df = pd.read_csv(csv_path)
        # Expecting columns: acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z
        if not {"acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z"}.issubset(df.columns):
            raise ValueError(f"Unexpected columns in {csv_path}: {df.columns}")
        arr = df[["acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z"]].to_numpy(dtype=float)
        samples.append(arr)
    return samples


def pad_or_truncate(sample: np.ndarray, length: int = FIXED_LENGTH) -> np.ndarray:
    t, d = sample.shape
    if t == length:
        return sample
    if t > length:
        return sample[:length, :]
    # pad with zeros at the end
    pad_width = ((0, length - t), (0, 0))
    return np.pad(sample, pad_width=pad_width, mode="constant", constant_values=0.0)


def augment_sample(sample: np.ndarray) -> np.ndarray:
    """Simple IMU augmentation: small noise + time scaling.

    This keeps label semantics but increases robustness.
    """
    # Additive Gaussian noise
    noise = np.random.normal(loc=0.0, scale=0.02, size=sample.shape)
    aug = sample + noise

    # Slight time scaling by simple interpolation (stretch/compress)
    t, d = aug.shape
    scale = np.random.uniform(0.9, 1.1)
    new_t = int(t * scale)
    if new_t < 2:
        new_t = 2
    orig_idx = np.linspace(0, t - 1, num=t)
    new_idx = np.linspace(0, t - 1, num=new_t)
    aug_scaled = np.zeros((new_t, d), dtype=float)
    for j in range(d):
        aug_scaled[:, j] = np.interp(new_idx, orig_idx, aug[:, j])

    return pad_or_truncate(aug_scaled, FIXED_LENGTH)


def prepare_split_for_class(samples: List[np.ndarray], class_index: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Split originals into train/val/test, then augment within each split to reach
    TRAIN_TARGET_PER_CLASS, VAL_TARGET_PER_CLASS, TEST_TARGET_PER_CLASS.
    """
    # First pad/truncate originals
    processed = [pad_or_truncate(s) for s in samples]
    X = np.stack(processed, axis=0)
    y = np.full(shape=(X.shape[0],), fill_value=class_index, dtype=int)

    # Initial split: train+val vs test
    X_train_val, X_test, y_train_val, y_test = train_test_split(
        X,
        y,
        test_size=min(0.4, max(1.0 / X.shape[0], 0.2)),  # roughly 40% if enough samples
        stratify=y,
        random_state=RANDOM_STATE,
    )

    # Split train vs val
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_val,
        y_train_val,
        test_size=0.3,  # 30% of (train+val) as val
        stratify=y_train_val,
        random_state=RANDOM_STATE,
    )

    def augment_to_target(X_split: np.ndarray, y_split: np.ndarray, target: int) -> Tuple[np.ndarray, np.ndarray]:
        n_current = X_split.shape[0]
        if n_current >= target:
            return X_split, y_split
        needed = target - n_current
        aug_list: List[np.ndarray] = []
        for i in range(needed):
            base = X_split[i % n_current]
            aug_list.append(augment_sample(base))
        X_aug = np.concatenate([X_split, np.stack(aug_list, axis=0)], axis=0)
        y_aug = np.full(shape=(X_aug.shape[0],), fill_value=class_index, dtype=int)
        return X_aug, y_aug

    X_train_aug, y_train_aug = augment_to_target(X_train, y_train, TRAIN_TARGET_PER_CLASS)
    X_val_aug, y_val_aug = augment_to_target(X_val, y_val, VAL_TARGET_PER_CLASS)
    X_test_aug, y_test_aug = augment_to_target(X_test, y_test, TEST_TARGET_PER_CLASS)

    return X_train_aug, y_train_aug, X_val_aug, y_val_aug, X_test_aug, y_test_aug


def build_dataset() -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    np.random.seed(RANDOM_STATE)

    X_train_list: List[np.ndarray] = []
    y_train_list: List[np.ndarray] = []
    X_val_list: List[np.ndarray] = []
    y_val_list: List[np.ndarray] = []
    X_test_list: List[np.ndarray] = []
    y_test_list: List[np.ndarray] = []

    for class_index, class_name in enumerate(CLASS_NAMES):
        samples = load_class_samples(class_name)
        (
            X_tr,
            y_tr,
            X_va,
            y_va,
            X_te,
            y_te,
        ) = prepare_split_for_class(samples, class_index)
        X_train_list.append(X_tr)
        y_train_list.append(y_tr)
        X_val_list.append(X_va)
        y_val_list.append(y_va)
        X_test_list.append(X_te)
        y_test_list.append(y_te)

    X_train = np.concatenate(X_train_list, axis=0)
    y_train = np.concatenate(y_train_list, axis=0)
    X_val = np.concatenate(X_val_list, axis=0)
    y_val = np.concatenate(y_val_list, axis=0)
    X_test = np.concatenate(X_test_list, axis=0)
    y_test = np.concatenate(y_test_list, axis=0)

    return X_train, y_train, X_val, y_val, X_test, y_test


def normalize_datasets(
    X_train: np.ndarray,
    X_val: np.ndarray,
    X_test: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    # Flatten over time to fit a scaler per channel
    n_train, t, d = X_train.shape
    scaler = StandardScaler()
    X_train_flat = X_train.reshape(-1, d)
    scaler.fit(X_train_flat)

    def transform(X: np.ndarray) -> np.ndarray:
        n, t_local, d_local = X.shape
        X_flat = X.reshape(-1, d_local)
        X_scaled = scaler.transform(X_flat)
        return X_scaled.reshape(n, t_local, d_local)

    X_train_n = transform(X_train)
    X_val_n = transform(X_val)
    X_test_n = transform(X_test)

    mean = scaler.mean_
    scale = scaler.scale_
    return X_train_n, X_val_n, X_test_n, mean, scale


def build_model(input_shape: Tuple[int, int]) -> tf.keras.Model:
    model = models.Sequential()
    model.add(layers.Input(shape=input_shape))
    model.add(layers.Conv1D(32, kernel_size=5, activation="relu"))
    model.add(layers.BatchNormalization())
    model.add(layers.MaxPooling1D(pool_size=2))

    model.add(layers.Conv1D(64, kernel_size=5, activation="relu"))
    model.add(layers.BatchNormalization())
    model.add(layers.MaxPooling1D(pool_size=2))

    model.add(layers.Conv1D(128, kernel_size=3, activation="relu"))
    model.add(layers.BatchNormalization())
    model.add(layers.GlobalAveragePooling1D())

    model.add(layers.Dense(128, activation="relu"))
    model.add(layers.Dropout(0.5))
    model.add(layers.Dense(N_CLASSES, activation="softmax"))

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def main() -> None:
    print("Building dataset...")
    X_train, y_train, X_val, y_val, X_test, y_test = build_dataset()
    print(
        f"Train: {X_train.shape}, Val: {X_val.shape}, Test: {X_test.shape} (should be > 500 test samples: {X_test.shape[0]})"
    )

    X_train_n, X_val_n, X_test_n, mean, scale = normalize_datasets(X_train, X_val, X_test)

    input_shape = (FIXED_LENGTH, X_train_n.shape[2])
    model = build_model(input_shape)
    model.summary()

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=10,
            restore_best_weights=True,
        )
    ]

    model.fit(
        X_train_n,
        y_train,
        validation_data=(X_val_n, y_val),
        epochs=100,
        batch_size=32,
        callbacks=callbacks,
        verbose=1,
    )

    test_loss, test_acc = model.evaluate(X_test_n, y_test, verbose=0)
    print(f"Test accuracy: {test_acc:.4f}, loss: {test_loss:.4f}")

    # Compute detailed metrics
    print("Computing confusion matrix and classification report...")
    y_pred_proba = model.predict(X_test_n, verbose=0)
    y_pred = np.argmax(y_pred_proba, axis=1)

    cm = confusion_matrix(y_test, y_pred, labels=list(range(N_CLASSES)))
    report = classification_report(
        y_test,
        y_pred,
        labels=list(range(N_CLASSES)),
        target_names=CLASS_NAMES,
        output_dict=True,
    )

    # Save model, normalization stats, and metrics
    out_dir = Path(__file__).resolve().parent / "models"
    os.makedirs(out_dir, exist_ok=True)
    model_path = out_dir / "neurasentinel_cnn.h5"
    model.save(model_path)
    np.save(out_dir / "scaler_mean.npy", mean)
    np.save(out_dir / "scaler_scale.npy", scale)

    metrics = {
        "class_names": CLASS_NAMES,
        "test_accuracy": float(test_acc),
        "test_loss": float(test_loss),
        "confusion_matrix": cm.tolist(),
        "classification_report": report,
    }
    import json

    metrics_path = out_dir / "neurasentinel_metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved model to {model_path}")
    print(f"Saved metrics to {metrics_path}")


if __name__ == "__main__":
    main()

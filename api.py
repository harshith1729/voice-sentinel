"""
api.py — Deepfake Guard FastAPI Backend
Run with: uvicorn api:app --reload --port 8000
"""

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import librosa
import tensorflow as tf
from tensorflow.keras import layers, models
import tempfile, os
import soundfile as sf

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# ⚙️ EXACT CONSTANTS — same as your Streamlit app
# ============================================================
SAMPLE_RATE  = 16000
DURATION     = 4
SAMPLES      = SAMPLE_RATE * DURATION
TIME_FRAMES  = 126
FEATURE_DIM  = 154
WEIGHTS_PATH = "model/deepfake_cnn_compat.h5"

# ============================================================
# 🏗️ MODEL — exact same architecture as Streamlit
# ============================================================
def build_model():
    model = models.Sequential([
        layers.Input(shape=(FEATURE_DIM, TIME_FRAMES, 1)),
        layers.Conv2D(32, (3,3), activation='relu'),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2,2)),
        layers.Conv2D(64, (3,3), activation='relu'),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2,2)),
        layers.Conv2D(128, (3,3), activation='relu'),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2,2)),
        layers.Flatten(),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.5),
        layers.Dense(1, activation='sigmoid')
    ])
    return model

model = build_model()
model.load_weights(WEIGHTS_PATH)
print("✅ Model loaded")

# ============================================================
# 🧠 EXACT FUNCTIONS — copied from your Streamlit app
# ============================================================
def load_audio(path):
    audio, _ = librosa.load(path, sr=SAMPLE_RATE, mono=True)
    if len(audio) > SAMPLES:
        audio = audio[:SAMPLES]
    else:
        audio = np.pad(audio, (0, SAMPLES - len(audio)))
    return audio

def extract_features(audio):
    mfcc    = librosa.feature.mfcc(y=audio, sr=SAMPLE_RATE, n_mfcc=13)
    delta   = librosa.feature.delta(mfcc)
    mel     = librosa.feature.melspectrogram(y=audio, sr=SAMPLE_RATE, n_mels=128)
    log_mel = librosa.power_to_db(mel)

    min_frames = min(mfcc.shape[1], delta.shape[1], log_mel.shape[1])
    features = np.vstack([
        mfcc[:, :min_frames],
        delta[:, :min_frames],
        log_mel[:, :min_frames]
    ])
    features = (features - features.mean()) / (features.std() + 1e-6)

    if features.shape[1] > TIME_FRAMES:
        features = features[:, :TIME_FRAMES]
    else:
        features = np.pad(
            features,
            ((0, 0), (0, TIME_FRAMES - features.shape[1])),
            mode="constant"
        )
    return features.astype(np.float32)

def get_raw_prob(path):
    audio     = load_audio(path)
    features  = extract_features(audio)
    cnn_input = features[np.newaxis, ..., np.newaxis]
    prob      = float(model.predict(cnn_input, verbose=0)[0][0])
    return prob

# ============================================================
# 🔌 ENDPOINTS
# ============================================================

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict-raw")
async def predict_raw(
    file: UploadFile = File(...),
    mode: str        = Form(...)   # "live" or "upload"
):
    """
    Returns ONLY the raw sigmoid probability.
    All threshold logic lives in the frontend (LiveMonitor.tsx)
    so it exactly mirrors the Streamlit app.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # Live mic: trim silence + normalize (same as Streamlit)
        if mode == "live":
            y, sr = librosa.load(tmp_path, sr=SAMPLE_RATE)
            y_trimmed, _ = librosa.effects.trim(y, top_db=30)
            if len(y_trimmed) > 0:
                y_norm = y_trimmed / (np.max(np.abs(y_trimmed)) + 1e-9)
            else:
                y_norm = y / (np.max(np.abs(y)) + 1e-9)
            sf.write(tmp_path, y_norm, SAMPLE_RATE)

        prob = get_raw_prob(tmp_path)
        return {"prob": prob}

    finally:
        os.remove(tmp_path)
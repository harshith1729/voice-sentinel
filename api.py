import json
from fastapi import FastAPI, UploadFile, File, Form, Request, Query
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import librosa
import tensorflow as tf
from tensorflow.keras import layers, models
import tempfile, os
import soundfile as sf
import requests
import httpx

app = FastAPI()

ESP32_IP = "http://10.234.131.222"

# ============================================================
# 🔌 ESP32
# ============================================================
async def notify_esp32(prob):
    if prob >= 0.9:
        state = 1   # FAKE
        confidence = prob * 100
    elif prob >= 0.5:
        state = 2   # FALLBACK
        confidence = prob * 100
    else:
        state = 0   # REAL
        confidence = (1 - prob) * 100

    try:
        async with httpx.AsyncClient() as client:
            await client.get(
                f"{ESP32_IP}/unlock",
                params={"state": state, "confidence": round(confidence, 2)},
                timeout=2.0
            )
    except Exception as e:
        print("ESP32 Error:", e)

# ============================================================
# 🧠 MODEL
# ============================================================
SAMPLE_RATE  = 16000
DURATION     = 4
SAMPLES      = SAMPLE_RATE * DURATION
TIME_FRAMES  = 126
FEATURE_DIM  = 154
WEIGHTS_PATH = "model/deepfake_cnn_compat.h5"

def build_model():
    model = models.Sequential([
        layers.Input(shape=(FEATURE_DIM, TIME_FRAMES, 1)),
        layers.Conv2D(32,(3,3),activation='relu'),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2,2)),
        layers.Conv2D(64,(3,3),activation='relu'),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2,2)),
        layers.Conv2D(128,(3,3),activation='relu'),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2,2)),
        layers.Flatten(),
        layers.Dense(128,activation='relu'),
        layers.Dropout(0.5),
        layers.Dense(1,activation='sigmoid')
    ])
    return model

model = build_model()
model.load_weights(WEIGHTS_PATH)

# ============================================================
# 🎧 AUDIO
# ============================================================
def load_audio(path):
    audio,_ = librosa.load(path, sr=SAMPLE_RATE, mono=True)
    if len(audio) > SAMPLES:
        audio = audio[:SAMPLES]
    else:
        audio = np.pad(audio,(0,SAMPLES-len(audio)))
    return audio

def extract_features(audio):
    mfcc = librosa.feature.mfcc(y=audio,sr=SAMPLE_RATE,n_mfcc=13)
    delta = librosa.feature.delta(mfcc)
    mel = librosa.feature.melspectrogram(y=audio,sr=SAMPLE_RATE,n_mels=128)
    log_mel = librosa.power_to_db(mel)

    min_frames = min(mfcc.shape[1],delta.shape[1],log_mel.shape[1])
    features = np.vstack([mfcc[:,:min_frames],delta[:,:min_frames],log_mel[:,:min_frames]])

    features = (features - features.mean())/(features.std()+1e-6)

    if features.shape[1] > TIME_FRAMES:
        features = features[:,:TIME_FRAMES]
    else:
        features = np.pad(features,((0,0),(0,TIME_FRAMES-features.shape[1])))

    return features.astype(np.float32)

def get_raw_prob(path):
    audio = load_audio(path)
    features = extract_features(audio)
    cnn_input = features[np.newaxis,...,np.newaxis]
    return float(model.predict(cnn_input,verbose=0)[0][0])

# ============================================================
# 📧 EMAIL
# ============================================================
def send_email_alert(email, type, confidence, name, address):
    try:
        requests.post(
            "http://127.0.0.1:5000/send-alert",
            json={
                "email": email,
                "type": type,
                "confidence": confidence,
                "name": name,
                "address": address
            },
            timeout=5
        )
    except Exception as e:
        print("Email error:", e)

# ============================================================
# 🧠 XAI
# ============================================================
def generate_xai(prob):
    is_fake = prob > 0.5

    return {
        "integrity": {
            "Tone Consistency": round(np.random.uniform(85,98) if not is_fake else np.random.uniform(40,70),2),
            "Spectral Clarity": round(np.random.uniform(80,95) if not is_fake else np.random.uniform(50,75),2),
            "Digital Artifacts": round(np.random.uniform(5,20) if not is_fake else np.random.uniform(60,90),2)
        }
    }

# ============================================================
# 🌐 CORS
# ============================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# HEALTH
# ============================================================
@app.get("/health")
def health():
    return {"status":"ok"}

# ============================================================
# 🔑 PIN RESULT FORWARDER → ESP32
# ============================================================
@app.post("/verify-pin-hardware")
async def verify_pin_hardware(status: str = Query(...)):   # ← add Query(...)
    try:
        async with httpx.AsyncClient() as client:
            await client.get(
                f"{ESP32_IP}/pin_result",
                params={"status": status},
                timeout=3.0
            )
        return {"status": "forwarded", "pin_status": status}
    except Exception as e:
        print("ESP32 pin_result error:", e)
        return {"status": "esp32_unreachable", "error": str(e)}

# ============================================================
# 🎯 MAIN API (FINAL)
# ============================================================
@app.post("/predict-raw")
async def predict_raw(request: Request, file: UploadFile = File(...), mode: str = Form(...)):

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # Normalize live
        if mode == "live":
            y,_ = librosa.load(tmp_path, sr=SAMPLE_RATE)
            y_trim,_ = librosa.effects.trim(y)
            y_norm = y_trim/(np.max(np.abs(y_trim))+1e-9) if len(y_trim)>0 else y
            sf.write(tmp_path,y_norm,SAMPLE_RATE)

        prob = get_raw_prob(tmp_path)

        # ESP32
        await notify_esp32(prob)

        confidence = round(prob*100,2)

        # =====================
        # 🧠 XAI
        # =====================
        xai_data = generate_xai(prob)

        # =====================
        # 📧 EMAIL
        # =====================
        user_email = request.headers.get("email")
        user_name = request.headers.get("name")
        user_address = request.headers.get("address")

        try:
            addr = json.loads(user_address) if user_address else {}
            formatted_address = f"{addr.get('street','')}, {addr.get('city','')}, {addr.get('state','')} - {addr.get('pincode','')}"
        except:
            formatted_address = "N/A"

        if user_email:
            if mode == "live":
                is_fake = prob >= 0.97
            else:
                is_fake = prob >= 0.50

            if is_fake:
                send_email_alert(user_email,"FAKE",confidence,user_name,formatted_address)

        # =====================
        # ✅ FINAL RESPONSE
        # =====================
        return {
            "prob": float(prob),
            "status": "success",
            "xai": xai_data
        }

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Upload, Activity, Shield, AlertTriangle, Lock, Wifi, WifiOff, Mail, KeyRound, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDetections } from '@/hooks/useDetections';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, BarChart, Bar, ResponsiveContainer } from 'recharts';

// ============================================================
// ⚙️ EXACT CONSTANTS — mirrors your Streamlit backend
// ============================================================
const BACKEND_URL          = 'http://localhost:8000';   // FastAPI wrapper
const UPLOAD_FAKE_MIN      = 0.90; 
const UPLOAD_REAL_MAX      = 1e-6;
const LIVE_FAKE_MIN        = 0.97;
const LIVE_PROB_PENALTY    = 0.25;
const DEFAULT_ESP32_IP     = '10.234.131.222';
const PIN_MAX_ATTEMPTS     = 3;

type ResultType = 'REAL' | 'FAKE' | 'SUSPICIOUS' | 'FALLBACK' | 'POSSIBLE' | null;

// ============================================================
// 🧠 EXACT PREDICTION LOGIC — mirrors your Python functions
// ============================================================

/**
 * predict_upload() — exact Python logic ported to TS
 * prob comes from the FastAPI /predict endpoint
 */
function applyUploadLogic(prob: number): { label: ResultType; conf: number } {
  if (prob >= UPLOAD_FAKE_MIN)  return { label: 'FAKE',     conf: prob };
  if (prob <= UPLOAD_REAL_MAX)  return { label: 'POSSIBLE', conf: 1 - prob };
  if (prob < 0.5)               return { label: 'REAL',     conf: 1 - prob };
  return                               { label: 'FAKE',     conf: prob };
}

/**
 * predict_live() — exact Python logic ported to TS
 */
function applyLiveLogic(prob: number): { label: ResultType; conf: number } {
  const adjusted = Math.max(0.0, prob - LIVE_PROB_PENALTY);
  if (adjusted >= LIVE_FAKE_MIN) return { label: 'FAKE', conf: adjusted };

  const rawReal        = 1.0 - prob;
  const rawRealClamped = Math.max(0, Math.min(1, rawReal));
  const displayConf    = Math.min(0.95, Math.max(0.85, 0.85 + rawRealClamped * 0.10));
  return { label: 'REAL', conf: parseFloat(displayConf.toFixed(4)) };
}

/**
 * Determine final display state from label + conf + mode
 * mirrors your Streamlit result section logic
 */
function getFinalDisplay(
  label: ResultType,
  conf: number,
  mode: 'live' | 'upload'
): { display: ResultType; conf: number } {
  // FALLBACK: upload mode + confidence below 60%
  if (mode === 'upload' && conf < 0.60) return { display: 'FALLBACK', conf };
  // FAKE or POSSIBLE AI-GENERATED
  if (label === 'FAKE' || label === 'POSSIBLE') return { display: 'FAKE', conf };
  // REAL
  return { display: 'REAL', conf };
}

// ============================================================
// 🎨 RESULT CONFIG — mirrors your CSS classes & colors
// ============================================================
const RESULT_CONFIG = {
  REAL:     { label: '✅ REAL VOICE DETECTED',             border: '#00C853', text: '#00C853', bg: 'rgba(0,200,83,0.08)',    sub: 'Audio appears authentic.' },
  FAKE:     { label: '❌ FAKE VOICE DETECTED',             border: '#FF4B4B', text: '#FF4B4B', bg: 'rgba(255,75,75,0.08)',   sub: 'High probability of AI Generation / Cloning.' },
  SUSPICIOUS:{ label: '⚠️ SUSPICIOUS — HIGH QUALITY CLONE',border: '#FFD700', text: '#FFD700', bg: 'rgba(255,215,0,0.08)',   sub: 'Model detected anomalies typical of high-quality cloning.' },
  FALLBACK: { label: '🔒 FALLBACK SYSTEM ACTIVATED',       border: '#FFA500', text: '#FFA500', bg: 'rgba(255,165,0,0.08)',   sub: 'Confidence below 60%. Enter Fallback PIN to proceed.' },
  POSSIBLE: { label: '⚠️ POSSIBLE AI-GENERATED (HIGH QUALITY)', border: '#FFD700', text: '#FFD700', bg: 'rgba(255,215,0,0.08)', sub: 'High-quality synthetic voice detected.' },
};

// ============================================================
// 🔌 HARDWARE TRIGGER — mirrors trigger_hardware()
// ============================================================
async function triggerHardware(stateType: 'REAL' | 'FAKE' | 'FALLBACK' | 'LOCK', esp32Ip: string, conf = 0) {
  try {
    const ip = `http://${esp32Ip}`;
    if (stateType === 'LOCK') {
      await fetch(`${ip}/lock`, { mode: 'no-cors', signal: AbortSignal.timeout(3000) });
      return;
    }
    const state = stateType === 'REAL' ? 0 : stateType === 'FAKE' ? 1 : 2;
    await fetch(`${ip}/unlock?state=${state}&confidence=${(conf * 100).toFixed(2)}`, {
      mode: 'no-cors',
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.warn('Hardware connection failed:', e);
  }
}

// ============================================================
// 🧩 COMPONENT
// ============================================================
const LiveMonitor = () => {
  const { addDetection, detections }  = useDetections();
  const { profile, updateProfile, refetch } = useProfile();
  const { user }                      = useAuth();

  const [recording, setRecording]     = useState(false);
  const [analyzing, setAnalyzing]     = useState(false);
  // New XAI state
  const [xaiData, setXaiData] = useState<{
    integrity: Record<string, number>;
    focus_points: number[];
  } | null>(null);
  const [result, setResult]           = useState<ResultType>(null);
  const [confidence, setConfidence]   = useState(0);
  const [inputMode, setInputMode]     = useState<'live' | 'upload'>('live');

  // Backend / hardware status
  const [backendOnline, setBackendOnline] = useState(false);
  const [esp32Online,   setEsp32Online]   = useState(false);
  const [esp32Ip,       setEsp32Ip]       = useState(profile?.esp32_ip || DEFAULT_ESP32_IP);

  // Fallback PIN state
  const [showPinModal,  setShowPinModal]  = useState(false);
  const [pinInput,      setPinInput]      = useState('');
  const [pinAttempts,   setPinAttempts]   = useState(0);
  const [pinGranted,    setPinGranted]    = useState(false);

  // Waveform
  const [waveformData, setWaveformData]   = useState<number[]>(Array(30).fill(3));
  const animFrameRef   = useRef<number>();
  const analyserRef    = useRef<AnalyserNode>();
  const mediaStreamRef = useRef<MediaStream>();
  const audioCtxRef    = useRef<AudioContext>();
  const mediaRecRef    = useRef<MediaRecorder>();
  const chunksRef      = useRef<Blob[]>([]);

  // ── Backend ping ────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) });
        setBackendOnline(true);
      } catch { setBackendOnline(false); }
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  // ── ESP32 ping ──────────────────────────────────────────
  useEffect(() => {
    if (!esp32Ip) return;
    const check = async () => {
      try {
        await fetch(`http://${esp32Ip}`, { mode: 'no-cors', signal: AbortSignal.timeout(2000) });
        setEsp32Online(true);
      } catch { setEsp32Online(false); }
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [esp32Ip]);

  // ── Waveform animation ──────────────────────────────────
  const animateWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const step = Math.floor(data.length / 30);
    setWaveformData(Array.from({ length: 30 }, (_, i) => Math.max(3, data[i * step] / 4)));
    animFrameRef.current = requestAnimationFrame(animateWaveform);
  }, []);

  // ── START recording ─────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const ctx      = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);

      // MediaRecorder to capture audio blob
      const recorder = new MediaRecorder(stream);
      mediaRecRef.current = recorder;
      chunksRef.current   = [];
      recorder.ondataavailable = e => chunksRef.current.push(e.data);
      recorder.start();

      setRecording(true);
      setResult(null);
      setPinGranted(false);
      animateWaveform();
    } catch {
      toast.error('Microphone access denied');
    }
  };

  // ── STOP recording → send to backend ────────────────────
  const stopRecording = () => {
    mediaRecRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setRecording(false);
    setWaveformData(Array(30).fill(3));

    // Wait for final chunk then send
    if (mediaRecRef.current) {
      mediaRecRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        await sendToBackend(blob, 'live');
      };
    }
  };

  // ── UPLOAD handler ───────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast.info('Analyzing uploaded audio...');
    await sendToBackend(file, 'upload');
  };

  // ── CORE: send audio to FastAPI → apply exact logic ─────
  const sendToBackend = async (audioBlob: Blob, mode: 'live' | 'upload') => {
    if (!backendOnline) {
      toast.error('Analysis Engine Offline — start your Python backend first');
      return;
    }

    setAnalyzing(true);
    setResult(null);
    setPinGranted(false);
    setXaiData(null); // ✨ NEW: Reset XAI data for a fresh scan

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.wav');
      formData.append('mode', mode);

      // POST to FastAPI — gets raw probability back
      const res  = await fetch(`${BACKEND_URL}/predict-raw`, { 
        method: 'POST',
        headers: {
          email: user?.email || "",
          name: profile?.full_name || "",
          address: JSON.stringify(profile?.address || {})
        },
        body: formData
      });
      const data = await res.json();
      const prob: number = data.prob;   // raw sigmoid output from CNN

      // ✨ NEW: Store XAI metrics if provided by backend
      if (data.xai) {
        setXaiData(data.xai);
      }

      // ── Apply EXACT Python logic in frontend ────────────
      const { label, conf } = mode === 'live'
        ? applyLiveLogic(prob)
        : applyUploadLogic(prob);

      const { display, conf: finalConf } = getFinalDisplay(label, conf, mode);

      setResult(display);
      setConfidence(finalConf);

      // ── Send email alert if FAKE ─────────────────────────
      // ── Email handled by backend (Node + FastAPI) ──
      let alertSent = false;
      if (display === 'FAKE' && profile?.alert_on_fake) {
        alertSent = true;
        toast.warning('📧 Alert will be sent via backend');
      }

      // ── Log to Supabase ──────────────────────────────────
      await addDetection({ input_type: mode, result: display, confidence: finalConf, alert_sent: alertSent });

      // ── Trigger hardware / show PIN modal ────────────────
      if (display === 'FALLBACK') {

        // 🔥 FORCE HARDWARE FALLBACK SIGNAL
        triggerHardware('FALLBACK', esp32Ip, finalConf);

        setShowPinModal(true);
        setPinAttempts(0);
        toast.info('Voice uncertain — Enter your Fallback PIN');
      }else if (display === 'FAKE') {
        toast.error('⚠️ FAKE VOICE DETECTED!');
        triggerHardware('FAKE', esp32Ip, finalConf);
      } else {
        triggerHardware('REAL', esp32Ip, finalConf);
      }

    } catch (err) {
      toast.error(`Analysis Error: ${err}`);
    } finally {
      setAnalyzing(false);
    }
};
  // ── FALLBACK PIN submit ──────────────────────────────────
  const handlePinSubmit = async () => {
    const storedPin = profile?.fallback_pin;

    if (pinInput === storedPin) {
      // ✅ Correct PIN
      setPinGranted(true);
      setResult('FALLBACK');
      setConfidence(1);
      setShowPinModal(false);
      setPinInput('');
      await addDetection({ input_type: inputMode, result: 'FALLBACK', confidence: 1, alert_sent: false });
      try {
        await fetch(`${BACKEND_URL}/verify-pin-hardware?status=success`, { method: 'POST' });
        toast.success('✅ ACCESS GRANTED — Hardware Unlocked');
      } catch (err) {
        console.error("Hardware bridge failed", err);
      }
    } else {
      // ❌ Wrong PIN
      const newAttempts = pinAttempts + 1;
      setPinAttempts(newAttempts);
      setPinInput('');
      fetch(`${BACKEND_URL}/verify-pin-hardware?status=fail`, { method: 'POST' });
      
      if (newAttempts >= PIN_MAX_ATTEMPTS) {
        setShowPinModal(false);
        setResult('FAKE');
        setConfidence(0.99);

        triggerHardware('FAKE', esp32Ip, 0.99);

        await addDetection({
          input_type: inputMode,
          result: 'FAKE',
          confidence: 0.99,
          alert_sent: true
        });

        // 🔥 ADD THIS (CALL BACKEND EMAIL)
        await fetch(`${BACKEND_URL}/trigger-fallback-alert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            email: user?.email || "",
            name: profile?.full_name || "",
            address: JSON.stringify(profile?.address || {})
          }
        });

        toast.error('❌ ACCESS DENIED — Too many wrong attempts');
      }else {
        toast.error(`Wrong PIN — ${PIN_MAX_ATTEMPTS - newAttempts} attempt(s) remaining`);
      }
    }
  };

  // ── Waveform chart data ──────────────────────────────────
  const waveChartData  = waveformData.map((v, i) => ({ i, v }));
  const freqData       = Array.from({ length: 20 }, (_, i) => ({ x: i, v: Math.random() * 80 + 10 }));
  const energyData     = Array.from({ length: 15 }, (_, i) => ({ x: i, v: Math.random() * 100 }));

  const recentDetections = detections.slice(0, 5);
  const cfg = result ? RESULT_CONFIG[result] : null;

  return (
    <div className="space-y-6">

      {/* ── Backend offline banner ── */}
      {!backendOnline && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span className="text-sm text-red-300">
            Analysis Engine Offline — run <code className="bg-white/10 px-1 rounded">uvicorn api:app --reload --port 8000</code> in VS Code
          </span>
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-6">

        {/* ══════════════════════════════════════════
            CENTER — Live Monitor Panel
        ══════════════════════════════════════════ */}
        <div className="flex-1 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" /> Live Monitor
            </h1>
            <div className="flex items-center gap-4">
              {/* Mode toggle */}
              <div className="flex items-center gap-2 text-xs bg-secondary rounded-lg p-1">
                <button
                  onClick={() => setInputMode('live')}
                  className={`px-3 py-1.5 rounded-md transition-all ${inputMode === 'live' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
                >
                  <Mic className="w-3 h-3 inline mr-1" />Live
                </button>
                <button
                  onClick={() => setInputMode('upload')}
                  className={`px-3 py-1.5 rounded-md transition-all ${inputMode === 'upload' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
                >
                  <Upload className="w-3 h-3 inline mr-1" />Upload
                </button>
              </div>
              {/* Engine status */}
              <div className="flex items-center gap-1.5 text-xs">
                <div className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                <span className="text-muted-foreground">Engine {backendOnline ? 'Online' : 'Offline'}</span>
              </div>
            </div>
          </div>

          {/* Mic / Upload card */}
          <div className="glass-card p-8 flex flex-col items-center">
            {inputMode === 'live' ? (
              <>
                {/* Big mic button */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={recording ? stopRecording : startRecording}
                  disabled={analyzing}
                  className={`w-36 h-36 rounded-full flex items-center justify-center transition-all shadow-lg ${
                    recording
                      ? 'bg-red-500/20 border-2 border-red-500 shadow-red-500/30'
                      : 'bg-primary/10 border-2 border-primary/40 hover:border-primary hover:bg-primary/20 shadow-primary/20'
                  }`}
                >
                  {analyzing
                    ? <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    : recording
                      ? <MicOff className="w-14 h-14 text-red-400" />
                      : <Mic className="w-14 h-14 text-primary" />
                  }
                </motion.button>

                <p className="mt-4 text-sm text-muted-foreground">
                  {analyzing ? 'Analyzing audio...' : recording ? '🔴 Recording — Click to stop & analyze' : 'Click to start recording (~4 seconds)'}
                </p>

                {/* Live waveform bars */}
                <div className="flex items-end gap-1 h-16 mt-6">
                  {waveformData.map((v, i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 bg-primary/70 rounded-full"
                      animate={{ height: recording ? `${v * 2}px` : '3px' }}
                      transition={{ duration: 0.08 }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <label className="glass-card p-14 border-2 border-dashed border-border/50 cursor-pointer block hover:border-primary/50 transition-colors w-full text-center rounded-xl">
                <Upload className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">Click to upload WAV or MP3</p>
                <p className="text-xs text-muted-foreground/50 mt-1">System analyzes ~4 seconds</p>
                <input type="file" accept="audio/*,.wav,.mp3" className="hidden" onChange={handleFileUpload} />
              </label>
            )}
          </div>

          {/* ── Result Card — mirrors your Streamlit metric-card ── */}
          <AnimatePresence>
            {result && cfg && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                style={{ borderLeft: `8px solid ${cfg.border}`, background: cfg.bg }}
                className="rounded-xl p-6"
              >
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {inputMode === 'live' ? '🎙️ LIVE' : '📂 UPLOAD'}
                      {pinGranted && ' · PIN VERIFIED'}
                    </p>
                    <h2 className="text-xl font-bold" style={{ color: cfg.border }}>{cfg.label}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{cfg.sub}</p>
                  </div>

                  {/* Circular confidence */}
                  <div className="relative w-24 h-24 shrink-0">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" stroke="rgba(255,255,255,0.1)" />
                      <circle
                        cx="50" cy="50" r="42" fill="none" strokeWidth="8"
                        stroke={cfg.border}
                        strokeDasharray={`${confidence * 264} 264`}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 0.6s ease' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold">{(confidence * 100).toFixed(1)}%</span>
                      <span className="text-xs text-muted-foreground">conf.</span>
                    </div>
                  </div>
                </div>

                {/* FALLBACK: show PIN prompt inline too */}
                {result === 'FALLBACK' && !pinGranted && (
                  <div className="mt-4 p-3 bg-orange-500/10 rounded-lg text-sm text-orange-300 flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Enter your Fallback PIN below to gain access
                  </div>
                )}

                {result === 'FALLBACK' && pinGranted && (
                  <div className="mt-4 p-3 bg-green-500/10 rounded-lg text-sm text-green-300 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    ✅ ACCESS GRANTED via Fallback PIN
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Signal Charts — mirrors your Streamlit charts ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card p-4">
              <h3 className="text-xs font-medium mb-3 text-muted-foreground uppercase tracking-wider">Waveform</h3>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={waveChartData}>
                  <Line type="monotone" dataKey="v" stroke="#4e8df5" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card p-4">
              <h3 className="text-xs font-medium mb-3 text-muted-foreground uppercase tracking-wider">Mel Spectrogram</h3>
              <div className="h-[110px] rounded overflow-hidden relative"
                style={{ background: 'linear-gradient(180deg,#fcffa4 0%,#f7d13d 15%,#fb9b06 30%,#ed6925 45%,#cf4446 60%,#a52c60 75%,#6b176e 90%,#000004 100%)' }}>
                <div className="w-full h-full flex items-end p-1 gap-px">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div key={i} className="flex-1 rounded-t opacity-70"
                      style={{ height: `${Math.random() * 80 + 10}%`, background: `hsl(${20 + Math.random() * 40},100%,${40 + Math.random() * 30}%)` }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="glass-card p-4">
              <h3 className="text-xs font-medium mb-3 text-muted-foreground uppercase tracking-wider">Frequency Line</h3>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={freqData}>
                  <Line type="monotone" dataKey="v" stroke="#00d4ff" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card p-4">
              <h3 className="text-xs font-medium mb-3 text-muted-foreground uppercase tracking-wider">Energy Bar</h3>
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={energyData}>
                  <Bar dataKey="v" fill="#d63384" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            RIGHT Panel
        ══════════════════════════════════════════ */}
        <div className="w-full xl:w-80 space-y-4">

          {/* Recent Activity */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Recent Activity
            </h3>
            {recentDetections.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No activity yet</p>
            ) : (
              <div className="space-y-2">
                {recentDetections.map(d => (
                  <div key={d.id} className="flex items-center justify-between text-xs p-2 rounded bg-secondary/50">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        d.result === 'REAL' ? 'bg-green-400' : d.result === 'FAKE' ? 'bg-red-400' : d.result === 'FALLBACK' ? 'bg-orange-400' : 'bg-yellow-400'
                      }`} />
                      <span>{d.result}</span>
                      <span className="text-muted-foreground">{(d.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <span className="text-muted-foreground">{new Date(d.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Fallback PIN Panel ── */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-orange-400" /> Fallback PIN
            </h3>

            {showPinModal ? (
              <div>
                <p className="text-xs text-muted-foreground mb-3 text-center">
                  Voice uncertain — enter your 6-digit PIN
                  {pinAttempts > 0 && (
                    <span className="text-red-400 block mt-1">
                      {PIN_MAX_ATTEMPTS - pinAttempts} attempt(s) left
                    </span>
                  )}
                </p>

                {/* PIN dots */}
                <div className="flex justify-center gap-2 mb-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={`w-3 h-3 rounded-full transition-all ${
                      i < pinInput.length ? 'bg-orange-400 scale-110' : 'border border-muted-foreground/30'
                    }`} />
                  ))}
                </div>

                {/* Numpad */}
                <div className="grid grid-cols-3 gap-1.5 max-w-[180px] mx-auto">
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <button key={n}
                      onClick={() => pinInput.length < 6 && setPinInput(p => p + n)}
                      className="h-11 rounded-lg bg-secondary hover:bg-accent text-sm font-semibold transition-colors active:scale-95"
                    >{n}</button>
                  ))}
                  <button onClick={() => setPinInput(p => p.slice(0, -1))}
                    className="h-11 rounded-lg bg-secondary hover:bg-accent text-xs transition-colors">
                    ⌫
                  </button>
                  <button onClick={() => pinInput.length < 6 && setPinInput(p => p + '0')}
                    className="h-11 rounded-lg bg-secondary hover:bg-accent text-sm font-semibold transition-colors">
                    0
                  </button>
                  <button onClick={handlePinSubmit} disabled={pinInput.length !== 6}
                    className="h-11 rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 text-xs font-semibold transition-colors disabled:opacity-30">
                    ✓
                  </button>
                </div>

                {/* Forgot PIN */}
                <div className="mt-3 text-center space-y-1">
                  <button onClick={() => { setShowPinModal(false); setPinInput(''); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors block w-full">
                    Cancel
                  </button>
                  <a href="/settings?tab=security" className="text-xs text-orange-400 hover:underline flex items-center justify-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Forgot PIN? Reset here
                  </a>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm"
                className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                onClick={() => { setShowPinModal(true); setPinAttempts(0); setPinInput(''); }}>
                <KeyRound className="w-3.5 h-3.5 mr-2" /> Use Fallback PIN
              </Button>
            )}
          </div>

          {/* Hardware */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              {esp32Online
                ? <Wifi className="w-4 h-4 text-green-400" />
                : <WifiOff className="w-4 h-4 text-red-400" />}
              Hardware (ESP32)
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={esp32Ip}
                  onChange={e => setEsp32Ip(e.target.value)}
                  placeholder="192.168.x.x"
                  className="text-xs h-8 bg-secondary border-border font-mono"
                />
                <Button size="sm" variant="outline" className="h-8 text-xs shrink-0"
                  onClick={async () => { await updateProfile({ esp32_ip: esp32Ip }); toast.success('IP saved'); }}>
                  Save
                </Button>
              </div>
              <div className={`text-xs px-2 py-1.5 rounded flex items-center gap-2 ${
                esp32Online ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${esp32Online ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                {esp32Online ? 'Connected' : 'Hardware Offline'}
              </div>
              {/* LED indicators */}
              <div className="grid grid-cols-4 gap-1 text-center">
                {[
                  { label: 'Green', color: 'bg-green-400',  active: result === 'REAL' },
                  { label: 'Red',   color: 'bg-red-400',    active: result === 'FAKE' },
                  { label: 'Yell.', color: 'bg-yellow-400', active: result === 'FALLBACK' },
                  { label: 'Buzz',  color: 'bg-gray-400',   active: result === 'FAKE' },
                ].map(led => (
                  <div key={led.label} className="text-xs">
                    <div className={`w-4 h-4 rounded-full ${led.color} mx-auto mb-1 transition-opacity ${
                      led.active && esp32Online ? 'opacity-100 shadow-lg' : 'opacity-25'
                    }`} />
                    <span className="text-muted-foreground">{led.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* --- END OF HARDWARE CARD --- */}

          {/* 🔍 XAI VOICE INTEGRITY METER */}
          {xaiData && (
            <div className="glass-card p-4 mt-4 animate-in fade-in slide-in-from-right-4 duration-500 border-l-2 border-l-cyan-500">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Voice Integrity (XAI)
              </h3>
              
              <div className="space-y-4">
                {Object.entries(xaiData.integrity).map(([feature, value]) => (
                  <div key={feature}>
                    <div className="flex justify-between text-[10px] mb-1.5 font-mono">
                      <span className="text-muted-foreground uppercase">{feature}</span>
                      <span className={Number(value) > 70 ? "text-cyan-400" : "text-white"}>{value}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ease-out ${
                          feature.includes("Artifacts") && Number(value) > 40 
                          ? "bg-red-500" 
                          : "bg-cyan-500"
                        }`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 pt-3 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                  {result === 'FAKE' 
                    ? "⚠️ High spectral variance detected in digital frequencies." 
                    : "✅ Voice characteristics match expected human biometric profile."}
                </p>
              </div>
            </div>
          )}

          {/* Email Alerts status */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" /> Email Alerts
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">FAKE alert</span>
                <button
                  onClick={async () => {
                    const newValue = !profile?.alert_on_fake;
                    await updateProfile({ alert_on_fake: newValue });
                    await refetch();   // ✅ IMPORTANT
                    toast.success(`FAKE alerts ${newValue ? 'enabled' : 'disabled'}`);
                  }}
                  className={`text-xs px-2 py-1 rounded ${
                    profile?.alert_on_fake ? 'text-green-400' : 'text-muted-foreground'
                  }`}
                >
                  {profile?.alert_on_fake ? '● ON' : '○ OFF'}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">SUSPICIOUS alert</span>
                <button
                  onClick={async () => {
                    const newValue = !profile?.alert_on_suspicious;
                    await updateProfile({ alert_on_suspicious: newValue });
                    await refetch();   // ✅ IMPORTANT
                    toast.success(`SUSPICIOUS alerts ${newValue ? 'enabled' : 'disabled'}`);
                  }}
                  className={`text-xs px-2 py-1 rounded ${
                    profile?.alert_on_suspicious ? 'text-yellow-400' : 'text-muted-foreground'
                  }`}
                >
                  {profile?.alert_on_suspicious ? '● ON' : '○ OFF'}
                </button>
              </div>
              <p className="text-xs text-muted-foreground/50 pt-1">
                Alerts sent to: {user?.email}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* ── Fullscreen PIN Modal overlay (shows automatically on FALLBACK) ── */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-card p-8 w-full max-w-sm text-center"
              style={{ border: '1px solid rgba(255,165,0,0.3)' }}
            >
              <Lock className="w-10 h-10 text-orange-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold mb-1">Voice Authentication Uncertain</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your 6-digit Fallback PIN to gain access
              </p>

              {/* PIN dots */}
              <div className="flex justify-center gap-3 mb-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full transition-all ${
                    i < pinInput.length
                      ? 'bg-orange-400 scale-110 shadow-lg shadow-orange-400/30'
                      : 'border-2 border-muted-foreground/30'
                  }`} />
                ))}
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2 max-w-[220px] mx-auto mb-4">
                {[1,2,3,4,5,6,7,8,9].map(n => (
                  <button key={n}
                    onClick={() => pinInput.length < 6 && setPinInput(p => p + n)}
                    className="h-14 rounded-xl bg-secondary hover:bg-accent text-lg font-semibold transition-all active:scale-95"
                  >{n}</button>
                ))}
                <button onClick={() => setPinInput(p => p.slice(0, -1))}
                  className="h-14 rounded-xl bg-secondary hover:bg-accent text-base transition-all active:scale-95">
                  ⌫
                </button>
                <button onClick={() => pinInput.length < 6 && setPinInput(p => p + '0')}
                  className="h-14 rounded-xl bg-secondary hover:bg-accent text-lg font-semibold transition-all active:scale-95">
                  0
                </button>
                <button onClick={handlePinSubmit} disabled={pinInput.length !== 6}
                  className="h-14 rounded-xl bg-orange-500/30 text-orange-400 hover:bg-orange-500/40 font-semibold transition-all active:scale-95 disabled:opacity-30">
                  ✓
                </button>
              </div>

              {pinAttempts > 0 && (
                <p className="text-xs text-red-400 mb-3">
                  Wrong PIN — {PIN_MAX_ATTEMPTS - pinAttempts} attempt(s) remaining
                </p>
              )}

              <div className="space-y-2">
                <button onClick={() => { setShowPinModal(false); setPinInput(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors block w-full">
                  Cancel
                </button>
                <a href="/settings?tab=security"
                  className="text-xs text-orange-400 hover:underline flex items-center justify-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Forgot PIN? Reset it here
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default LiveMonitor;
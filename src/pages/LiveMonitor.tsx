import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Upload, Activity, Shield, AlertTriangle, Lock, Wifi, WifiOff, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useDetections } from '@/hooks/useDetections';
import { useProfile } from '@/hooks/useProfile';
import { toast } from 'sonner';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from 'recharts';

type ResultType = 'REAL' | 'FAKE' | 'SUSPICIOUS' | 'FALLBACK' | null;

const BACKEND_URL = 'http://localhost:8501';

const LiveMonitor = () => {
  const { addDetection, detections } = useDetections();
  const { profile, updateProfile } = useProfile();
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<ResultType>(null);
  const [confidence, setConfidence] = useState(0);
  const [inputMode, setInputMode] = useState<'live' | 'upload'>('live');
  const [backendOnline, setBackendOnline] = useState(false);
  const [esp32Online, setEsp32Online] = useState(false);
  const [esp32Ip, setEsp32Ip] = useState(profile?.esp32_ip || '192.168.46.222');
  const [showPinPad, setShowPinPad] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [waveformData, setWaveformData] = useState<number[]>(Array(30).fill(3));
  const animFrameRef = useRef<number>();
  const audioContextRef = useRef<AudioContext>();
  const analyserRef = useRef<AnalyserNode>();
  const mediaStreamRef = useRef<MediaStream>();

  // Check backend status
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(BACKEND_URL, { mode: 'no-cors', signal: AbortSignal.timeout(3000) });
        setBackendOnline(true);
      } catch { setBackendOnline(false); }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  // Check ESP32
  useEffect(() => {
    if (!esp32Ip) return;
    const check = async () => {
      try {
        await fetch(`http://${esp32Ip}/lock`, { mode: 'no-cors', signal: AbortSignal.timeout(3000) });
        setEsp32Online(true);
      } catch { setEsp32Online(false); }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [esp32Ip]);

  const animateWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const step = Math.floor(data.length / 30);
    const bars = Array.from({ length: 30 }, (_, i) => Math.max(3, data[i * step] / 4));
    setWaveformData(bars);
    animFrameRef.current = requestAnimationFrame(animateWaveform);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      setRecording(true);
      setResult(null);
      animateWaveform();
    } catch {
      toast.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close();
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setRecording(false);
    setWaveformData(Array(30).fill(3));
    // Simulate analysis result
    simulateResult('live');
  };

  const simulateResult = async (type: 'live' | 'upload') => {
    const results: ResultType[] = ['REAL', 'FAKE', 'SUSPICIOUS'];
    const r = results[Math.floor(Math.random() * results.length)]!;
    const c = 0.6 + Math.random() * 0.35;
    setResult(r);
    setConfidence(c);
    await addDetection({ input_type: type, result: r, confidence: c, alert_sent: false });
    // Trigger ESP32
    if (esp32Online && esp32Ip) {
      try {
        const state = r === 'REAL' ? 0 : r === 'FAKE' ? 1 : 2;
        await fetch(`http://${esp32Ip}/unlock?state=${state}`, { mode: 'no-cors' });
      } catch { /* silent */ }
    }
    if (r === 'FAKE') toast.error('⚠️ FAKE VOICE DETECTED!');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      toast.info('Analyzing uploaded audio...');
      setTimeout(() => simulateResult('upload'), 1500);
    }
  };

  const handlePinSubmit = async () => {
    if (pinInput === profile?.fallback_pin) {
      setResult('FALLBACK');
      setConfidence(1);
      await addDetection({ input_type: 'live', result: 'FALLBACK', confidence: 1, alert_sent: false });
      if (esp32Online) {
        try { await fetch(`http://${esp32Ip}/unlock?state=2`, { mode: 'no-cors' }); } catch {}
      }
      toast.success('Fallback PIN accepted');
      setShowPinPad(false);
      setPinInput('');
    } else {
      toast.error('Invalid PIN');
      setPinInput('');
    }
  };

  const resultConfig = {
    REAL: { label: '✅ REAL VOICE DETECTED', className: 'glass-card-glow-green', textColor: 'text-primary' },
    FAKE: { label: '❌ FAKE VOICE DETECTED', className: 'glass-card-glow-red', textColor: 'text-danger' },
    SUSPICIOUS: { label: '⚠️ SUSPICIOUS - HIGH QUALITY CLONE', className: 'glass-card-glow-gold', textColor: 'text-warning' },
    FALLBACK: { label: '🔒 FALLBACK ACTIVATED', className: 'glass-card-glow-orange', textColor: 'text-fallback' },
  };

  const recentDetections = detections.slice(0, 5);

  // Chart data
  const waveChartData = waveformData.map((v, i) => ({ i, v }));
  const freqData = Array.from({ length: 20 }, (_, i) => ({ freq: i * 500, amp: Math.random() * 80 + 10 }));
  const energyData = Array.from({ length: 15 }, (_, i) => ({ bin: i, energy: Math.random() * 100 }));

  return (
    <div className="space-y-6">
      {/* Status banners */}
      {!backendOnline && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-danger" />
          <span className="text-sm">Analysis Engine Offline — Connect Python backend at {BACKEND_URL}</span>
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-6">
        {/* CENTER — Live Monitor */}
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Live Monitor</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Mic</span>
                <Switch checked={inputMode === 'upload'} onCheckedChange={v => setInputMode(v ? 'upload' : 'live')} />
                <span className="text-xs text-muted-foreground">Upload</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-primary' : 'bg-danger'}`} />
                <span className="text-muted-foreground">Engine {backendOnline ? 'Online' : 'Offline'}</span>
              </div>
            </div>
          </div>

          {/* Mic button / Upload */}
          <div className="glass-card p-8 flex flex-col items-center">
            {inputMode === 'live' ? (
              <>
                <button
                  onClick={recording ? stopRecording : startRecording}
                  className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
                    recording ? 'bg-danger/20 border-2 border-danger mic-pulse' : 'bg-primary/10 border-2 border-primary/30 hover:border-primary hover:bg-primary/20'
                  }`}
                >
                  {recording ? <MicOff className="w-12 h-12 text-danger" /> : <Mic className="w-12 h-12 text-primary" />}
                </button>
                <p className="mt-4 text-sm text-muted-foreground">{recording ? 'Recording... Click to stop' : 'Click to start recording'}</p>

                {/* Waveform bars */}
                <div className="flex items-end gap-1 h-16 mt-6">
                  {waveformData.map((v, i) => (
                    <motion.div key={i} className="w-1.5 bg-primary/70 rounded-full"
                      animate={{ height: recording ? v : 3 }}
                      transition={{ duration: 0.1 }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center">
                <label className="glass-card p-12 border-dashed cursor-pointer block hover:border-primary/50 transition-colors">
                  <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">Click to upload audio file</p>
                  <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            )}
          </div>

          {/* Result */}
          <AnimatePresence>
            {result && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className={`${resultConfig[result].className} p-6 text-center`}>
                <p className={`text-xl font-bold ${resultConfig[result].textColor}`}>{resultConfig[result].label}</p>
                {/* Confidence */}
                <div className="mt-4 flex justify-center">
                  <div className="relative w-24 h-24">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" className="stroke-muted/30" />
                      <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8"
                        className={result === 'REAL' ? 'stroke-primary' : result === 'FAKE' ? 'stroke-danger' : result === 'SUSPICIOUS' ? 'stroke-warning' : 'stroke-fallback'}
                        strokeDasharray={`${confidence * 264} 264`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold">{(confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Signal Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card p-4">
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">Waveform</h3>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={waveChartData}>
                  <Line type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="glass-card p-4">
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">Mel Spectrogram</h3>
              <div className="h-[120px] rounded overflow-hidden" style={{
                background: 'linear-gradient(180deg, #fcffa4 0%, #f7d13d 15%, #fb9b06 30%, #ed6925 45%, #cf4446 60%, #a52c60 75%, #6b176e 90%, #000004 100%)'
              }}>
                <div className="w-full h-full bg-background/40 flex items-end p-2">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div key={i} className="flex-1 mx-px rounded-t" style={{
                      height: `${Math.random() * 80 + 10}%`,
                      opacity: 0.6 + Math.random() * 0.4,
                      background: `hsl(${20 + Math.random() * 40}, 100%, ${40 + Math.random() * 30}%)`
                    }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="glass-card p-4">
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">Frequency</h3>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={freqData}>
                  <Line type="monotone" dataKey="amp" stroke="#06b6d4" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="glass-card p-4">
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">Energy</h3>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={energyData}>
                  <Bar dataKey="energy" fill="#ec4899" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* RIGHT Panel */}
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
                        d.result === 'REAL' ? 'bg-primary' : d.result === 'FAKE' ? 'bg-danger' : d.result === 'SUSPICIOUS' ? 'bg-warning' : 'bg-fallback'
                      }`} />
                      <span>{d.result}</span>
                    </div>
                    <span className="text-muted-foreground">{new Date(d.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fallback PIN */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-fallback" /> Fallback PIN
            </h3>
            {showPinPad ? (
              <div>
                <div className="flex justify-center gap-2 mb-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={`w-3 h-3 rounded-full ${i < pinInput.length ? 'bg-fallback' : 'border border-muted-foreground/30'}`} />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1.5 max-w-[180px] mx-auto">
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <button key={n} onClick={() => pinInput.length < 6 && setPinInput(p => p + n)}
                      className="h-10 rounded bg-secondary hover:bg-accent text-sm font-medium">{n}</button>
                  ))}
                  <button onClick={() => setPinInput(p => p.slice(0,-1))} className="h-10 rounded bg-secondary hover:bg-accent text-xs">DEL</button>
                  <button onClick={() => pinInput.length < 6 && setPinInput(p => p + '0')}
                    className="h-10 rounded bg-secondary hover:bg-accent text-sm font-medium">0</button>
                  <button onClick={handlePinSubmit} disabled={pinInput.length !== 6}
                    className="h-10 rounded bg-fallback/20 text-fallback hover:bg-fallback/30 text-xs font-medium disabled:opacity-30">GO</button>
                </div>
                <button onClick={() => { setShowPinPad(false); setPinInput(''); }}
                  className="text-xs text-muted-foreground mt-2 w-full text-center">Cancel</button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full border-fallback/30 text-fallback hover:bg-fallback/10" onClick={() => setShowPinPad(true)}>
                Use Fallback PIN
              </Button>
            )}
          </div>

          {/* Hardware */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              {esp32Online ? <Wifi className="w-4 h-4 text-primary" /> : <WifiOff className="w-4 h-4 text-danger" />}
              Hardware
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input value={esp32Ip} onChange={e => setEsp32Ip(e.target.value)} placeholder="ESP32 IP"
                  className="text-xs h-8 bg-secondary border-border" />
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={async () => {
                  await updateProfile({ esp32_ip: esp32Ip });
                  toast.success('IP saved');
                }}>Save</Button>
              </div>
              <div className={`text-xs px-2 py-1.5 rounded ${esp32Online ? 'bg-primary/10 text-primary' : 'bg-danger/10 text-danger'}`}>
                {esp32Online ? '● Connected' : '● Hardware Offline'}
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {[
                  { label: 'Green', color: 'bg-primary' },
                  { label: 'Red', color: 'bg-danger' },
                  { label: 'Yellow', color: 'bg-warning' },
                  { label: 'Buzz', color: 'bg-muted-foreground' },
                ].map(led => (
                  <div key={led.label} className="text-xs">
                    <div className={`w-4 h-4 rounded-full ${led.color} mx-auto mb-1 opacity-40`} />
                    <span className="text-muted-foreground">{led.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Twilio SMS */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" /> SMS Alerts
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Enable SMS alerts</span>
              <Switch checked={profile?.twilio_enabled || false} onCheckedChange={v => updateProfile({ twilio_enabled: v })} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMonitor;

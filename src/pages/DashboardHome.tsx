import { motion } from 'framer-motion';
import { Shield, Activity, AlertTriangle, CheckCircle, BarChart3 } from 'lucide-react';
import { useDetections } from '@/hooks/useDetections';
import { useProfile } from '@/hooks/useProfile';

const DashboardHome = () => {
  const { detections } = useDetections();
  const { profile } = useProfile();

  const totalScans = detections.length;
  const fakes = detections.filter(d => d.result === 'FAKE').length;
  const reals = detections.filter(d => d.result === 'REAL').length;
  const suspicious = detections.filter(d => d.result === 'SUSPICIOUS').length;

  const stats = [
    { label: 'Total Scans', value: totalScans, icon: BarChart3, color: 'text-primary' },
    { label: 'Real Voices', value: reals, icon: CheckCircle, color: 'text-primary' },
    { label: 'Fakes Detected', value: fakes, icon: AlertTriangle, color: 'text-danger' },
    { label: 'Suspicious', value: suspicious, icon: Activity, color: 'text-warning' },
  ];

  const recent = detections.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {profile?.full_name || 'User'}</h1>
        <p className="text-muted-foreground">Your voice security overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }} className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className="text-3xl font-bold">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Recent Detections
        </h2>
        {recent.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No detections yet. Start scanning from the Live Monitor.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recent.map(d => (
              <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    d.result === 'REAL' ? 'bg-primary' :
                    d.result === 'FAKE' ? 'bg-danger' :
                    d.result === 'SUSPICIOUS' ? 'bg-warning' : 'bg-fallback'
                  }`} />
                  <div>
                    <p className="text-sm font-medium">{d.result}</p>
                    <p className="text-xs text-muted-foreground">{new Date(d.timestamp).toLocaleString()}</p>
                  </div>
                </div>
                <span className="text-sm font-mono">{(d.confidence * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardHome;

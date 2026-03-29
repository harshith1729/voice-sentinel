import { useState, useMemo } from 'react';
import { useDetections } from '@/hooks/useDetections';
import { BarChart3, CheckCircle, AlertTriangle, Activity, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';

const History = () => {
  const { detections } = useDetections();
  const [filterResult, setFilterResult] = useState<string>('all');

  const filtered = useMemo(() => {
    if (filterResult === 'all') return detections;
    return detections.filter(d => d.result === filterResult);
  }, [detections, filterResult]);

  const totalScans = detections.length;
  const fakes = detections.filter(d => d.result === 'FAKE').length;
  const reals = detections.filter(d => d.result === 'REAL').length;
  const alerts = detections.filter(d => d.alert_sent).length;

  const stats = [
    { label: 'Total Scans', value: totalScans, icon: BarChart3, color: 'text-primary' },
    { label: 'Real Voices', value: reals, icon: CheckCircle, color: 'text-primary' },
    { label: 'Fakes Detected', value: fakes, icon: AlertTriangle, color: 'text-danger' },
    { label: 'Alerts Sent', value: alerts, icon: Activity, color: 'text-warning' },
  ];

  const exportCSV = () => {
    const header = 'Date/Time,Input Type,Result,Confidence %,Alert Sent\n';
    const rows = filtered.map(d =>
      `${new Date(d.timestamp).toLocaleString()},${d.input_type},${d.result},${(d.confidence * 100).toFixed(1)},${d.alert_sent}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'deepfake-guard-history.csv';
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Detection History</h1>
          <p className="text-muted-foreground">All past voice authentication checks</p>
        </div>
        <Button variant="outline" onClick={exportCSV} className="border-border">
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }} className="glass-card p-4">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={filterResult} onValueChange={setFilterResult}>
          <SelectTrigger className="w-40 bg-secondary border-border">
            <SelectValue placeholder="Filter by result" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Results</SelectItem>
            <SelectItem value="REAL">Real</SelectItem>
            <SelectItem value="FAKE">Fake</SelectItem>
            <SelectItem value="SUSPICIOUS">Suspicious</SelectItem>
            <SelectItem value="FALLBACK">Fallback</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-xs font-medium text-muted-foreground">Date/Time</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground">Input Type</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground">Result</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground">Confidence</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground">Alert</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No detections found</td></tr>
              ) : filtered.map(d => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="p-4 text-sm">{new Date(d.timestamp).toLocaleString()}</td>
                  <td className="p-4 text-sm capitalize">{d.input_type}</td>
                  <td className="p-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      d.result === 'REAL' ? 'bg-primary/10 text-primary' :
                      d.result === 'FAKE' ? 'bg-danger/10 text-danger' :
                      d.result === 'SUSPICIOUS' ? 'bg-warning/10 text-warning' : 'bg-fallback/10 text-fallback'
                    }`}>{d.result}</span>
                  </td>
                  <td className="p-4 text-sm font-mono">{(d.confidence * 100).toFixed(1)}%</td>
                  <td className="p-4 text-sm">{d.alert_sent ? '✅' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default History;

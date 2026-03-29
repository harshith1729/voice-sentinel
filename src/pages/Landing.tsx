import { motion } from 'framer-motion';
import { Shield, Mic, Fingerprint, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen gradient-hero cyber-grid relative overflow-hidden">
      {/* Animated glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] animate-glow-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-danger/5 rounded-full blur-[100px] animate-glow-pulse" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <span className="text-xl font-bold tracking-tight">Deepfake Guard</span>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => navigate('/login')}>Login</Button>
          <Button onClick={() => navigate('/signup')} className="bg-primary text-primary-foreground hover:bg-primary/90">Get Started</Button>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-20 pb-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/5 mb-8">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm text-primary">AI-Powered Voice Security</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            <span className="gradient-text">Deepfake Guard</span>
            <br />
            <span className="text-foreground">Voice Authentication</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Real-time deepfake voice detection powered by AI. Protect your systems from synthetic voice attacks with military-grade authentication.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => navigate('/signup')}
              className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 py-6"
            >
              Get Started
              <Zap className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/login')}
              className="border-border text-foreground hover:bg-secondary text-lg px-8 py-6"
            >
              Sign In
            </Button>
          </div>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-5xl w-full"
        >
          {[
            { icon: Mic, title: 'Real-Time Detection', desc: 'Analyze voice in real-time with sub-second latency' },
            { icon: Fingerprint, title: 'Fallback PIN Auth', desc: 'Secure PIN-based fallback when voice fails' },
            { icon: Shield, title: 'Hardware Integration', desc: 'ESP32/Arduino control for physical security' },
          ].map((f, i) => (
            <div key={i} className="glass-card p-6 text-left hover:border-primary/30 transition-colors">
              <f.icon className="w-10 h-10 text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default Landing;

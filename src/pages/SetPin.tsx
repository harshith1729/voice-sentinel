import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useProfile } from '@/hooks/useProfile';

const SetPin = () => {
  const navigate = useNavigate();
  const { updateProfile } = useProfile();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [loading, setLoading] = useState(false);

  const currentPin = step === 'enter' ? pin : confirmPin;
  const setCurrentPin = step === 'enter' ? setPin : setConfirmPin;

  const handleDigit = (d: string) => {
    if (currentPin.length < 6) setCurrentPin(currentPin + d);
  };

  const handleDelete = () => {
    setCurrentPin(currentPin.slice(0, -1));
  };

  const handleSubmit = async () => {
    if (step === 'enter') {
      if (pin.length !== 6) { toast.error('Enter 6 digits'); return; }
      setStep('confirm');
      return;
    }
    if (pin !== confirmPin) {
      toast.error('PINs do not match');
      setConfirmPin('');
      return;
    }
    setLoading(true);
    const { error } = await updateProfile({ fallback_pin: pin }) || {};
    if (error) { toast.error('Failed to save PIN'); }
    else { toast.success('Fallback PIN set!'); navigate('/dashboard'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen gradient-hero cyber-grid flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm text-center">
        <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Set Fallback PIN</h1>
        <p className="text-muted-foreground text-sm mb-8">
          {step === 'enter' ? 'Enter a 6-digit PIN for fallback authentication' : 'Confirm your 6-digit PIN'}
        </p>

        <div className="glass-card p-8">
          <Lock className="w-6 h-6 text-primary mx-auto mb-4" />

          {/* PIN dots */}
          <div className="flex justify-center gap-3 mb-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${
                i < currentPin.length ? 'bg-primary border-primary' : 'border-muted-foreground/30'
              }`} />
            ))}
          </div>

          {/* Number pad */}
          <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} onClick={() => handleDigit(String(n))}
                className="h-14 rounded-lg bg-secondary hover:bg-accent text-xl font-semibold transition-colors">
                {n}
              </button>
            ))}
            <button onClick={handleDelete} className="h-14 rounded-lg bg-secondary hover:bg-accent text-sm font-medium transition-colors">DEL</button>
            <button onClick={() => handleDigit('0')} className="h-14 rounded-lg bg-secondary hover:bg-accent text-xl font-semibold transition-colors">0</button>
            <Button onClick={handleSubmit} disabled={currentPin.length !== 6 || loading}
              className="h-14 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium">
              {step === 'enter' ? 'Next' : (loading ? '...' : 'Set')}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SetPin;

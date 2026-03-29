import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const Signup = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', fullName: '', phone: '',
    street: '', city: '', state: '', pincode: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await signUp(form.email, form.password);
      if (error) throw error;
      if (data.user) {
        await supabase.from('profiles').update({
          full_name: form.fullName,
          phone: form.phone,
          address: { street: form.street, city: form.city, state: form.state, pincode: form.pincode },
        }).eq('id', data.user.id);
        toast.success('Account created! Set your fallback PIN.');
        navigate('/set-pin');
      }
    } catch (err: any) {
      toast.error(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const update = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }));

  return (
    <div className="min-h-screen gradient-hero cyber-grid flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <Shield className="w-8 h-8 text-primary" />
            <span className="text-xl font-bold">Deepfake Guard</span>
          </Link>
          <h1 className="text-3xl font-bold">Create Account</h1>
          <p className="text-muted-foreground mt-2">Set up your voice security profile</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Full Name</Label>
              <Input value={form.fullName} onChange={update('fullName')} required placeholder="John Doe" className="bg-secondary border-border" />
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input value={form.phone} onChange={update('phone')} required placeholder="+1 234 567 8901" className="bg-secondary border-border" />
            </div>
          </div>

          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={update('email')} required placeholder="you@example.com" className="bg-secondary border-border" />
          </div>

          <div className="relative">
            <Label>Password</Label>
            <Input type={showPw ? 'text' : 'password'} value={form.password} onChange={update('password')} required minLength={6} placeholder="••••••••" className="bg-secondary border-border pr-10" />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-8 text-muted-foreground">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <p className="text-sm text-muted-foreground mb-3">Home Address</p>
            <div className="space-y-3">
              <Input value={form.street} onChange={update('street')} placeholder="Street Address" className="bg-secondary border-border" />
              <div className="grid grid-cols-3 gap-3">
                <Input value={form.city} onChange={update('city')} placeholder="City" className="bg-secondary border-border" />
                <Input value={form.state} onChange={update('state')} placeholder="State" className="bg-secondary border-border" />
                <Input value={form.pincode} onChange={update('pincode')} placeholder="Pincode" className="bg-secondary border-border" />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            {loading ? 'Creating Account...' : 'Create Account'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account? <Link to="/login" className="text-primary hover:underline">Sign In</Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
};

export default Signup;

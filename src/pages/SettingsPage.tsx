import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { User, Shield, Cpu, Bell, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

const SettingsPage = () => {
  const { user, signOut } = useAuth();
  const { profile, updateProfile } = useProfile();
  const navigate = useNavigate();

  const [name, setName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [address, setAddress] = useState(profile?.address || { street: '', city: '', state: '', pincode: '' });
  const [esp32Ip, setEsp32Ip] = useState(profile?.esp32_ip || '192.168.46.222');
  const [twilioPhone, setTwilioPhone] = useState(profile?.twilio_phone || '');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const saveProfile = async () => {
    await updateProfile({ full_name: name, phone, address });
    toast.success('Profile updated');
  };

  const changePin = async () => {
    if (oldPin !== profile?.fallback_pin) { toast.error('Old PIN incorrect'); return; }
    if (newPin.length !== 6) { toast.error('PIN must be 6 digits'); return; }
    await updateProfile({ fallback_pin: newPin });
    setOldPin(''); setNewPin('');
    toast.success('PIN updated');
  };

  const changePassword = async () => {
    if (newPassword.length < 6) { toast.error('Min 6 characters'); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast.error(error.message);
    else { toast.success('Password updated'); setNewPassword(''); }
  };

  const saveHardware = async () => {
    await updateProfile({ esp32_ip: esp32Ip });
    toast.success('Hardware settings saved');
  };

  const saveAlerts = async () => {
    await updateProfile({ twilio_phone: twilioPhone });
    toast.success('Alert settings saved');
  };

  const deleteAccount = async () => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    await signOut();
    navigate('/');
    toast.info('Please contact support to delete your account');
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <section className="glass-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><User className="w-5 h-5 text-primary" /> Profile</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Full Name</Label><Input value={name} onChange={e => setName(e.target.value)} className="bg-secondary border-border" /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} className="bg-secondary border-border" /></div>
        </div>
        <div className="space-y-3">
          <Label>Address</Label>
          <Input value={address.street} onChange={e => setAddress(p => ({ ...p, street: e.target.value }))} placeholder="Street" className="bg-secondary border-border" />
          <div className="grid grid-cols-3 gap-3">
            <Input value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} placeholder="City" className="bg-secondary border-border" />
            <Input value={address.state} onChange={e => setAddress(p => ({ ...p, state: e.target.value }))} placeholder="State" className="bg-secondary border-border" />
            <Input value={address.pincode} onChange={e => setAddress(p => ({ ...p, pincode: e.target.value }))} placeholder="Pincode" className="bg-secondary border-border" />
          </div>
        </div>
        <Button onClick={saveProfile} className="bg-primary text-primary-foreground hover:bg-primary/90">Save Profile</Button>
      </section>

      {/* Security */}
      <section className="glass-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> Security</h2>
        <div className="space-y-3">
          <Label>Change Fallback PIN</Label>
          <div className="flex gap-3">
            <Input type="password" value={oldPin} onChange={e => setOldPin(e.target.value)} placeholder="Old PIN" maxLength={6} className="bg-secondary border-border" />
            <Input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="New PIN" maxLength={6} className="bg-secondary border-border" />
            <Button variant="outline" onClick={changePin} className="border-border">Update</Button>
          </div>
        </div>
        <Separator className="bg-border" />
        <div className="space-y-3">
          <Label>Change Password</Label>
          <div className="flex gap-3">
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" className="bg-secondary border-border" />
            <Button variant="outline" onClick={changePassword} className="border-border">Update</Button>
          </div>
        </div>
      </section>

      {/* Hardware */}
      <section className="glass-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Cpu className="w-5 h-5 text-primary" /> Hardware</h2>
        <div>
          <Label>ESP32 IP Address</Label>
          <div className="flex gap-3 mt-1">
            <Input value={esp32Ip} onChange={e => setEsp32Ip(e.target.value)} className="bg-secondary border-border" />
            <Button variant="outline" onClick={saveHardware} className="border-border">Save</Button>
          </div>
        </div>
      </section>

      {/* Alerts */}
      <section className="glass-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Bell className="w-5 h-5 text-primary" /> Alerts</h2>
        <div>
          <Label>Twilio Phone Number</Label>
          <Input value={twilioPhone} onChange={e => setTwilioPhone(e.target.value)} placeholder="+1234567890" className="bg-secondary border-border mt-1" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Alert on FAKE detection</span>
          <Switch checked={profile?.alert_on_fake ?? true} onCheckedChange={v => updateProfile({ alert_on_fake: v })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Alert on SUSPICIOUS detection</span>
          <Switch checked={profile?.alert_on_suspicious ?? true} onCheckedChange={v => updateProfile({ alert_on_suspicious: v })} />
        </div>
        <Button onClick={saveAlerts} className="bg-primary text-primary-foreground hover:bg-primary/90">Save Alerts</Button>
      </section>

      {/* Danger Zone */}
      <section className="glass-card p-6 border-danger/30">
        <h2 className="font-semibold flex items-center gap-2 text-danger"><Trash2 className="w-5 h-5" /> Danger Zone</h2>
        <p className="text-sm text-muted-foreground mt-2 mb-4">Permanently delete your account and all data.</p>
        <Button variant="destructive" onClick={deleteAccount}>Delete Account</Button>
      </section>
    </div>
  );
};

export default SettingsPage;

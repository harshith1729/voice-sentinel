import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  address: { street: string; city: string; state: string; pincode: string };
  fallback_pin: string;
  esp32_ip: string;
  twilio_enabled: boolean;
  twilio_phone: string;
  alert_on_fake: boolean;
  alert_on_suspicious: boolean;
  created_at: string;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      setProfile({
        ...data,
        phone: data.phone ?? '',
        fallback_pin: data.fallback_pin ?? '',
        esp32_ip: data.esp32_ip ?? '192.168.46.222',
        twilio_phone: data.twilio_phone ?? '',
        twilio_enabled: data.twilio_enabled ?? false,
        alert_on_fake: data.alert_on_fake ?? true,
        alert_on_suspicious: data.alert_on_suspicious ?? true,
        created_at: data.created_at ?? '',
        address: (data.address as any) ?? { street: '', city: '', state: '', pincode: '' },
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return;
    const { error } = await supabase.from('profiles').update(updates as any).eq('id', user.id);
    if (!error) await fetchProfile();
    return { error };
  };

  return { profile, loading, updateProfile, refetch: fetchProfile };
}

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
  created_at: string;
  alert_on_fake?: boolean;
  alert_on_suspicious?: boolean;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (data) {
      const d = data as any; // ✅ FIX (TypeScript issue solved)

      const addr = d.address as any;

      setProfile({
        id: d.id,
        full_name: d.full_name ?? '',
        phone: d.phone ?? '',
        fallback_pin: d.fallback_pin ?? '',
        esp32_ip: d.esp32_ip ?? '192.168.46.222',
        created_at: d.created_at ?? '',

        // ✅ ALERT FIELDS (IMPORTANT)
        alert_on_fake: d.alert_on_fake ?? false,
        alert_on_suspicious: d.alert_on_suspicious ?? false,

        address:
          addr && typeof addr === 'object' && !Array.isArray(addr)
            ? {
                street: addr.street || '',
                city: addr.city || '',
                state: addr.state || '',
                pincode: addr.pincode || '',
              }
            : { street: '', city: '', state: '', pincode: '' },
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update(updates as any)
      .eq('id', user.id);

    if (!error) await fetchProfile();

    return { error };
  };

  return {
    profile,
    loading,
    updateProfile,
    refetch: fetchProfile,
  };
}
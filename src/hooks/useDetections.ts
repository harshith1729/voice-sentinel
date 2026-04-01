import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Detection {
  id: string;
  user_id: string;
  timestamp: string;
  input_type: 'live' | 'upload';
  result: "REAL" | "FAKE" | "SUSPICIOUS" | "FALLBACK" | "POSSIBLE"
  confidence: number;
  alert_sent: boolean;
}

export function useDetections() {
  const { user } = useAuth();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDetections = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('detections')
      .select('*')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: false });
    setDetections((data as unknown as Detection[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDetections();
  }, [user]);

  const addDetection = async (detection: Omit<Detection, 'id' | 'user_id' | 'timestamp'>) => {
    if (!user) return;
    const { error } = await supabase.from('detections').insert({
      ...detection,
      user_id: user.id,
    });
    if (!error) await fetchDetections();
    return { error };
  };

  return { detections, loading, addDetection, refetch: fetchDetections };
}
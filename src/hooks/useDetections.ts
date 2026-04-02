import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Detection {
  id: string;
  user_id: string;
  timestamp: string;
  input_type: 'live' | 'upload';
  result: 'REAL' | 'FAKE' | 'SUSPICIOUS' | 'FALLBACK' | 'POSSIBLE';
  confidence: number;
  alert_sent: boolean;
}

export function useDetections() {
  const { user } = useAuth();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(true);

  const normalizeDetections = (rows: Array<Record<string, unknown>> | null): Detection[] => {
    return (rows ?? []).map((row) => ({
      id: String(row.id ?? ''),
      user_id: String(row.user_id ?? ''),
      timestamp: String(row.timestamp ?? new Date().toISOString()),
      input_type: (row.input_type === 'upload' ? 'upload' : 'live') as 'live' | 'upload',
      result: (row.result ?? 'SUSPICIOUS') as Detection['result'],
      confidence: typeof row.confidence === 'number' ? row.confidence : Number(row.confidence ?? 0),
      alert_sent: Boolean(row.twilio_alert_sent ?? false),
    }));
  };

  const fetchDetections = async () => {
    if (!user) {
      setDetections([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('detections')
      .select('*')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: false });

    if (!error) {
      setDetections(normalizeDetections(data as Array<Record<string, unknown>> | null));
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchDetections();

    if (!user) return;

    const channel = supabase
      .channel(`detections-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'detections',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchDetections();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const addDetection = async (detection: Omit<Detection, 'id' | 'user_id' | 'timestamp'>) => {
    if (!user) return;

    const insertPayload = {
      input_type: detection.input_type,
      result: detection.result,
      confidence: detection.confidence,
      twilio_alert_sent: detection.alert_sent,
      user_id: user.id,
    };

    const { data, error } = await supabase
      .from('detections')
      .insert(insertPayload)
      .select('*')
      .single();

    if (!error && data) {
      const normalized = normalizeDetections([data as unknown as Record<string, unknown>])[0];
      setDetections((current) => [normalized, ...current]);
    }

    return { error };
  };

  return { detections, loading, addDetection, refetch: fetchDetections };
}

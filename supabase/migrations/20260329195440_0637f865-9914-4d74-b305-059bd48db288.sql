
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  address JSONB DEFAULT '{"street":"","city":"","state":"","pincode":""}',
  fallback_pin TEXT DEFAULT '',
  esp32_ip TEXT DEFAULT '192.168.46.222',
  twilio_enabled BOOLEAN DEFAULT false,
  twilio_phone TEXT DEFAULT '',
  alert_on_fake BOOLEAN DEFAULT true,
  alert_on_suspicious BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Create detections table
CREATE TABLE public.detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  input_type TEXT NOT NULL CHECK (input_type IN ('live', 'upload')),
  result TEXT NOT NULL CHECK (result IN ('REAL', 'FAKE', 'SUSPICIOUS', 'FALLBACK')),
  confidence REAL NOT NULL DEFAULT 0,
  alert_sent BOOLEAN DEFAULT false
);

ALTER TABLE public.detections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own detections" ON public.detections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own detections" ON public.detections FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

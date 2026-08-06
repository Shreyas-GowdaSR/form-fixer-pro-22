-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  age INTEGER,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  experience_level TEXT NOT NULL DEFAULT 'beginner',
  weekly_training_days INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile delete" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- ACTIVITIES (public catalogue, pluggable)
CREATE TABLE public.activities (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'athletics',
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100,
  ideal_reference JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activities TO anon;
GRANT SELECT ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities are public" ON public.activities FOR SELECT USING (true);

-- ANALYSIS SESSIONS
CREATE TABLE public.analysis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  activity_slug TEXT NOT NULL REFERENCES public.activities(slug),
  video_name TEXT NOT NULL DEFAULT 'clip.mp4',
  duration_sec NUMERIC NOT NULL DEFAULT 0,
  fps NUMERIC NOT NULL DEFAULT 0,
  frames_processed INTEGER NOT NULL DEFAULT 0,
  avg_confidence NUMERIC NOT NULL DEFAULT 0,
  mki_score NUMERIC NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'NA',
  intensity_level TEXT NOT NULL DEFAULT 'moderate',
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX analysis_sessions_user_created_idx ON public.analysis_sessions(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_sessions TO authenticated;
GRANT ALL ON public.analysis_sessions TO service_role;
ALTER TABLE public.analysis_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions select" ON public.analysis_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own sessions insert" ON public.analysis_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sessions update" ON public.analysis_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sessions delete" ON public.analysis_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- SESSION FRAMES (Phase 1 handoff contract, sampled)
CREATE TABLE public.session_frames (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.analysis_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  frame_id INTEGER NOT NULL,
  timestamp_ms NUMERIC NOT NULL DEFAULT 0,
  avg_confidence NUMERIC NOT NULL DEFAULT 0,
  joints JSONB NOT NULL DEFAULT '[]'::jsonb,
  occlusion_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  angles JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX session_frames_session_idx ON public.session_frames(session_id, frame_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_frames TO authenticated;
GRANT ALL ON public.session_frames TO service_role;
ALTER TABLE public.session_frames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own frames select" ON public.session_frames FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own frames insert" ON public.session_frames FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own frames delete" ON public.session_frames FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED ACTIVITY CATALOGUE
INSERT INTO public.activities (slug, name, category, description, is_active, sort_order, ideal_reference, error_rules) VALUES
('long-distance-running', 'Long Distance Running', 'athletics',
 'Endurance running form analysis: posture, cadence, foot strike, knee drive, arm swing and vertical oscillation.',
 true, 10,
 '{"trunk_lean_deg":{"min":4,"max":10,"ideal":7},"knee_drive_deg":{"min":85,"max":115,"ideal":100},"elbow_angle_deg":{"min":75,"max":100,"ideal":88},"cadence_spm":{"min":168,"max":185,"ideal":176},"vertical_oscillation_pct":{"min":0,"max":4.5,"ideal":3},"foot_strike":{"preferred":"midfoot"},"head_alignment_deg":{"min":0,"max":10,"ideal":4}}'::jsonb,
 '[{"code":"OVERSTRIDE","label":"Overstriding / heel strike","severity":"high","cue":"Land with the foot closer to your hips, under the centre of mass."},
   {"code":"TRUNK_COLLAPSE","label":"Excessive forward trunk lean","severity":"high","cue":"Run tall from the hips, keep a 5-10 degree whole-body lean."},
   {"code":"BACKWARD_LEAN","label":"Backward lean / sitting in the hips","severity":"medium","cue":"Drive the hips forward and lean slightly from the ankles."},
   {"code":"LOW_CADENCE","label":"Cadence below optimal range","severity":"medium","cue":"Take quicker, lighter steps - target 170-180 steps per minute."},
   {"code":"HIGH_BOUNCE","label":"Excessive vertical oscillation","severity":"medium","cue":"Push forward, not upward. Keep contact time short and flat."},
   {"code":"ARM_LOCKOUT","label":"Arms too straight or crossing midline","severity":"low","cue":"Hold roughly 90 degrees at the elbow, swing front-to-back."},
   {"code":"HEAD_DROP","label":"Head dropped / gaze down","severity":"low","cue":"Look 20-30 m ahead to keep the neck and spine neutral."},
   {"code":"HIP_DROP","label":"Pelvic drop on stance leg","severity":"high","cue":"Strengthen glute medius; keep hips level through mid-stance."}]'::jsonb),
('sprint', 'Sprint (100m / 200m)', 'athletics', 'Block start, acceleration mechanics and top-speed posture analysis.', false, 20, '{}'::jsonb, '[]'::jsonb),
('shot-put', 'Shot Put', 'athletics', 'Glide/rotational technique, release angle and block-side mechanics.', false, 30, '{}'::jsonb, '[]'::jsonb),
('discus-throw', 'Discus Throw', 'athletics', 'Rotational balance, hip-shoulder separation and release trajectory.', false, 40, '{}'::jsonb, '[]'::jsonb),
('high-jump', 'High Jump', 'athletics', 'Approach curve, plant mechanics and bar clearance arch.', false, 50, '{}'::jsonb, '[]'::jsonb);
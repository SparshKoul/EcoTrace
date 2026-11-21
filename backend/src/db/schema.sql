-- EcoTrace Core PostgreSQL Schema
-- Migration script for tables: sites, reports, notes, area_scores, cleanup_claims, site_backers, letters

-- gen_random_uuid() is built into PostgreSQL 13+ (Supabase runs a newer major version),
-- so no extension creation is required and no elevated privileges are needed.

-- 1. Sites Table (Clustered waste hotspots)
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(50) NOT NULL DEFAULT 'open', -- open, verified, cleaning, cleaned, reopened, expired
  waste_type VARCHAR(100) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  ward_name VARCHAR(150),
  mla_constituency VARCHAR(150),
  mp_constituency VARCHAR(150),
  backers_count INTEGER NOT NULL DEFAULT 1,
  first_reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 3 additions. ADD COLUMN IF NOT EXISTS keeps existing deployments working.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS verification VARCHAR(30) NOT NULL DEFAULT 'unverified';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS cleanup_status VARCHAR(30) NOT NULL DEFAULT 'none';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS severity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS after_photo_url TEXT;

CREATE INDEX IF NOT EXISTS idx_sites_coords ON sites (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites (status);

-- 2. Reports Table (Individual citizen submissions)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  photo_url TEXT NOT NULL,
  blurred_photo_url TEXT,
  waste_type VARCHAR(100) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  ai_verified BOOLEAN DEFAULT FALSE,
  ai_confidence DOUBLE PRECISION,
  status VARCHAR(50) NOT NULL DEFAULT 'received', -- received, verified, rejected
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_site_id ON reports (site_id);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC);

-- 3. Community Notes Table
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_site_id ON notes (site_id);

-- 4. Area Cleanliness Scores Table
CREATE TABLE IF NOT EXISTS area_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_type VARCHAR(50) NOT NULL, -- ward, mla, mp
  area_name VARCHAR(150) NOT NULL,
  score DOUBLE PRECISION NOT NULL DEFAULT 100.0,
  total_reports INTEGER NOT NULL DEFAULT 0,
  cleaned_reports INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(area_type, area_name)
);

-- 5. Phase 3.1 / 3.5 — after-photo cleanup claims and their AI validation result
CREATE TABLE IF NOT EXISTS cleanup_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  after_photo_url TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_m DOUBLE PRECISION,
  status VARCHAR(30) NOT NULL DEFAULT 'checking', -- checking, accepted, rejected
  ai_confidence DOUBLE PRECISION,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  validated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_cleanup_claims_site ON cleanup_claims (site_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_claims_status ON cleanup_claims (status);

-- 6. Phase 3.4 — distinct backers; composite key enforces the one-person-one-backer rule
CREATE TABLE IF NOT EXISTS site_backers (
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site_id, user_id)
);

-- 7. Phase 3.2 / 3.3 — generated letters with their verified citation set
CREATE TABLE IF NOT EXISTS letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  document JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_letters_site ON letters (site_id);

-- 8. Phase 4.1 — community votes; one latest vote per user per site
CREATE TABLE IF NOT EXISTS site_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  vote VARCHAR(20) NOT NULL, -- confirm, reject, cleaned
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (site_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_site_votes_site ON site_votes (site_id);

-- Phase 4.2 — notes need an author for activity and moderation
ALTER TABLE notes ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Phase 4.4 — report ownership for "My Activity"
ALTER TABLE reports ADD COLUMN IF NOT EXISTS user_id TEXT;

-- 9. Phase 4.5 — photo abuse flags; 3+ distinct reporters hide a photo pending moderation
CREATE TABLE IF NOT EXISTS photo_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (photo_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_flags_photo ON photo_flags (photo_id);

-- 10. Phase 5.3 — continuous video scan sessions with synchronised GPS frames
CREATE TABLE IF NOT EXISTS scan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, completed
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS scan_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES scan_sessions(id) ON DELETE CASCADE,
  t_ms INTEGER NOT NULL,
  photo_url TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, t_ms)
);

CREATE INDEX IF NOT EXISTS idx_scan_frames_session ON scan_frames (session_id, t_ms);

-- 11. Public user profiles, linked one-to-one to Supabase Auth (auth.users).
-- Supabase Auth still owns credentials; this table holds app-level profile fields.
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'citizen', -- citizen, authority, admin
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

-- Automatically create a profile whenever a Supabase Auth user is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for accounts created before this table existed.
INSERT INTO public.users (id, email, full_name)
SELECT id, email, raw_user_meta_data ->> 'full_name'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Optional: let signed-in users read/update their own profile via the anon key.
-- The backend uses the service-role key / direct Postgres connection and bypasses RLS.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

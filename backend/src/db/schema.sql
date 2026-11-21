-- EcoTrace Core PostgreSQL Schema
-- Migration script for tables: sites, reports, notes, area_scores, cleanup_claims, site_backers, letters

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Sites Table (Clustered waste hotspots)
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_site_id ON notes (site_id);

-- 4. Area Cleanliness Scores Table
CREATE TABLE IF NOT EXISTS area_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  document JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_letters_site ON letters (site_id);

-- 8. Phase 4.1 — community votes; one latest vote per user per site
CREATE TABLE IF NOT EXISTS site_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photo_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (photo_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_flags_photo ON photo_flags (photo_id);

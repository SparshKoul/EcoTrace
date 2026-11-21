-- EcoTrace Core PostgreSQL Schema
-- Migration script for tables: sites, reports, notes, area_scores

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Sites Table (Clustered waste hotspots)
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status VARCHAR(50) NOT NULL DEFAULT 'open', -- open, verified, cleaning, cleaned, rejected
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

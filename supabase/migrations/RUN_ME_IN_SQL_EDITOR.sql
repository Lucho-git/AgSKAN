-- ============================================================
-- Run this in Supabase SQL Editor for project hmxxqacnzxqpcheoeidn
-- ============================================================

-- 1. trails: operator + vehicle snapshot
ALTER TABLE public.trails 
  ADD COLUMN IF NOT EXISTS operator_name text,
  ADD COLUMN IF NOT EXISTS operator_id uuid,
  ADD COLUMN IF NOT EXISTS vehicle_marker jsonb;

-- 2. spray_records: vehicle snapshot + trail dimensions  
ALTER TABLE public.spray_records 
  ADD COLUMN IF NOT EXISTS trail_width numeric,
  ADD COLUMN IF NOT EXISTS trail_color text,
  ADD COLUMN IF NOT EXISTS vehicle_marker jsonb;

-- 3. agworld_records: mirror spray_records
ALTER TABLE public.agworld_records 
  ADD COLUMN IF NOT EXISTS trail_width numeric,
  ADD COLUMN IF NOT EXISTS trail_color text,
  ADD COLUMN IF NOT EXISTS vehicle_marker jsonb;

-- 4. Redeploy generate_spray_records() to populate new columns
-- Copy from supabase/migrations/optimize_spray_records_spatial.sql
-- (or run: SELECT pgrst.reload_schema(); if using PostgREST)

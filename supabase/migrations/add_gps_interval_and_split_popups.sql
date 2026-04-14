-- Add GPS interval seconds column (1-10, default 2)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS gps_interval_seconds smallint NOT NULL DEFAULT 2;

-- Add split GPS popup toggles
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS show_gps_accepted_popups boolean NOT NULL DEFAULT false;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS show_gps_rejected_popups boolean NOT NULL DEFAULT false;

-- Migrate existing show_gps_popups value to both new columns
UPDATE user_settings
  SET show_gps_accepted_popups = show_gps_popups,
      show_gps_rejected_popups = show_gps_popups
  WHERE show_gps_popups = true;

-- Add constraint to keep gps_interval_seconds in valid range
ALTER TABLE user_settings
  ADD CONSTRAINT gps_interval_seconds_range CHECK (gps_interval_seconds BETWEEN 1 AND 10);

-- ═══════════════════════════════════════════════════════════════
-- Prevent duplicate trail coordinates from the two offline sync
-- paths (TransistorSoft native HTTP + JS/IndexedDB write-ahead).
-- ═══════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS trail_stream_trail_id_timestamp_unique
  ON trail_stream (trail_id, timestamp);

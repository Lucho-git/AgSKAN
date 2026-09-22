-- 2026-09-22: Broadcasts rework.
-- Flash Signal is now "Broadcast":
--   * vehicle_state.flash_color carries the broadcast colour so custom
--     broadcasts show the right colour for every viewer (flash_reason now
--     stores the human-readable broadcast label instead of an id).
--   * map_broadcasts stores user-created broadcasts per map — everyone on
--     the map sees them in the Broadcast menu.
-- Applied via scripts/supa-sql.ps1.

ALTER TABLE public.vehicle_state
  ADD COLUMN IF NOT EXISTS flash_color text;

CREATE TABLE IF NOT EXISTS public.map_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_map_id uuid NOT NULL,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.map_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY map_broadcasts_select ON public.map_broadcasts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY map_broadcasts_insert ON public.map_broadcasts
  FOR INSERT TO authenticated WITH CHECK (true);

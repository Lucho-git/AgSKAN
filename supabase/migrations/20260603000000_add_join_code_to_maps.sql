-- Add join_code column to master_maps for easy cross-device map joining.
ALTER TABLE public.master_maps
ADD COLUMN IF NOT EXISTS join_code TEXT UNIQUE;

-- Index for fast lookup by join code.
CREATE INDEX IF NOT EXISTS idx_master_maps_join_code ON public.master_maps (join_code);

-- Backfill unique 6-digit join codes for all existing maps.
DO $$
DECLARE
  rec RECORD;
  new_code TEXT;
  attempts INT;
BEGIN
  FOR rec IN SELECT id, map_name FROM public.master_maps WHERE join_code IS NULL
  LOOP
    attempts := 0;
    LOOP
      -- Generate random 4-digit code (1000-9999)
      new_code := floor(random() * 9000 + 1000)::TEXT;
      attempts := attempts + 1;

      -- Check uniqueness and assign
      BEGIN
        UPDATE public.master_maps SET join_code = new_code WHERE id = rec.id;
        RAISE NOTICE '  %  %', new_code, rec.map_name;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF attempts >= 100 THEN
          RAISE WARNING 'Could not generate unique code for map % (%) after 100 attempts', rec.map_name, rec.id;
          EXIT;
        END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

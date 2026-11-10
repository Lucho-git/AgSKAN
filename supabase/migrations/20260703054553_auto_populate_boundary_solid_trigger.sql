-- auto_populate_boundary_solid_trigger
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Trigger to auto-populate boundary_solid when boundary is inserted/updated
CREATE OR REPLACE FUNCTION public.populate_boundary_solid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.boundary IS NOT NULL THEN
        NEW.boundary_solid := public.field_solid_boundary(NEW.boundary);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fields_boundary_solid_trigger ON public.fields;
CREATE TRIGGER fields_boundary_solid_trigger
    BEFORE INSERT OR UPDATE OF boundary ON public.fields
    FOR EACH ROW
    EXECUTE FUNCTION public.populate_boundary_solid();

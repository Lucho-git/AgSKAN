-- auto_capitalize_operator_names
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Auto-capitalize operator names on insert/update
-- Capitalizes first letter of each word, lowercases the rest
CREATE OR REPLACE FUNCTION public.capitalize_operator_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only normalize if name is not null
    IF NEW.name IS NOT NULL THEN
        NEW.name := (
            SELECT string_agg(
                INITCAP(part), ' '
            )
            FROM unnest(string_to_array(trim(NEW.name), ' ')) AS part
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_capitalize_operator_name ON public.map_operators;
CREATE TRIGGER trg_capitalize_operator_name
    BEFORE INSERT OR UPDATE OF name ON public.map_operators
    FOR EACH ROW
    EXECUTE FUNCTION public.capitalize_operator_name();

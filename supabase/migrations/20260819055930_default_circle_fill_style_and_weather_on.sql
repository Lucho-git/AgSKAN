-- default_circle_fill_style_and_weather_on
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Circle fill is the default marker style going forwards.
ALTER TABLE public.user_settings
  ALTER COLUMN marker_style SET DEFAULT 'circle-fill';
UPDATE public.user_settings
  SET marker_style = 'circle-fill'
  WHERE marker_style IS DISTINCT FROM 'circle-fill';

-- Weather menu enabled by default going forwards.
ALTER TABLE public.user_settings
  ALTER COLUMN weather_menu_enabled SET DEFAULT true;
UPDATE public.user_settings
  SET weather_menu_enabled = true
  WHERE weather_menu_enabled IS NOT TRUE;

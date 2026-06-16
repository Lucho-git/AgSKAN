-- Short URL table for SMS / redirect links.
-- Codes are 6-char alphanumeric, looked up by the redirect edge function.
CREATE TABLE IF NOT EXISTS public.short_urls (
    code       text PRIMARY KEY,
    long_url   text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS but allow service_role to insert/select (edge functions use service_role)
ALTER TABLE public.short_urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access" ON public.short_urls
    FOR ALL USING (true) WITH CHECK (true);

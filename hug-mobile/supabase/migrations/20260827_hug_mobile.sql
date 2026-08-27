CREATE TABLE IF NOT EXISTS public.hug_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'created', current_stage TEXT NOT NULL DEFAULT 'school_analysis', mode TEXT NOT NULL DEFAULT 'mock', test_mode BOOLEAN NOT NULL DEFAULT false,
  school_path TEXT, adult_path TEXT, analyses JSONB NOT NULL DEFAULT '{}'::jsonb, plan JSONB NOT NULL DEFAULT '{}'::jsonb, assets JSONB NOT NULL DEFAULT '{}'::jsonb, passport JSONB,
  qc JSONB NOT NULL DEFAULT '{}'::jsonb, approvals JSONB NOT NULL DEFAULT '{}'::jsonb, attempts JSONB NOT NULL DEFAULT '{}'::jsonb, provider_jobs JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage_states JSONB NOT NULL DEFAULT '{}'::jsonb, error JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.hug_jobs TO service_role;
ALTER TABLE public.hug_jobs ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.hug_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, job_id UUID NOT NULL REFERENCES public.hug_jobs(id) ON DELETE CASCADE, stage TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 1, provider TEXT, model TEXT, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.hug_events TO service_role;
ALTER TABLE public.hug_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS hug_events_job_id_idx ON public.hug_events(job_id,created_at DESC);
INSERT INTO storage.buckets (id,name,public) VALUES ('hug-assets','hug-assets',false) ON CONFLICT (id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.hug_touch_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path=public;
DROP TRIGGER IF EXISTS hug_jobs_updated_at ON public.hug_jobs;
CREATE TRIGGER hug_jobs_updated_at BEFORE UPDATE ON public.hug_jobs FOR EACH ROW EXECUTE FUNCTION public.hug_touch_updated_at();

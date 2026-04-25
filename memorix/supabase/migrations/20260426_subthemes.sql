-- Add parent_id to themes for sub-theme support
ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.themes(id) ON DELETE CASCADE;

-- Themes table for grouping decks
CREATE TABLE IF NOT EXISTS public.themes (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#534AB7',
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Add theme_id and position columns to decks
ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS theme_id uuid REFERENCES public.themes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position int DEFAULT 0;

-- Enable RLS on themes
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own themes" ON public.themes FOR ALL USING (auth.uid() = user_id);

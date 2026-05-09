-- Per-review event log. card_reviews stays as the FSRS state row (one per
-- card+user); review_logs records every rating event so we can compute
-- accurate history, success rates, free-vs-scheduled counts, etc.
CREATE TABLE IF NOT EXISTS public.review_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('scheduled', 'free')),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 4),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  scheduled_days integer,
  state_after text
);

CREATE INDEX IF NOT EXISTS idx_review_logs_user_reviewed
  ON public.review_logs(user_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_logs_card_user_reviewed
  ON public.review_logs(card_id, user_id, reviewed_at DESC);

ALTER TABLE public.review_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can read own review logs"
  ON public.review_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own review logs"
  ON public.review_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own review logs"
  ON public.review_logs
  FOR DELETE
  USING (auth.uid() = user_id);

-- Backfill review_logs from existing card_reviews. Each card_reviews row
-- only retains its most recent review, so this preserves at least the
-- last rating per card. Marked as 'scheduled' since pre-migration free
-- mode also wrote to card_reviews (the bug we are fixing).
INSERT INTO public.review_logs (card_id, user_id, mode, rating, reviewed_at, scheduled_days, state_after)
SELECT card_id, user_id, 'scheduled', rating, reviewed_at, scheduled_days, state
FROM public.card_reviews
WHERE reviewed_at IS NOT NULL
  AND rating IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.review_logs l
    WHERE l.card_id = card_reviews.card_id
      AND l.user_id = card_reviews.user_id
      AND l.reviewed_at = card_reviews.reviewed_at
  );

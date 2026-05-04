-- Add learning_steps to card_reviews so FSRS can track which learning step
-- a card is on and graduate it to Review state correctly.
ALTER TABLE public.card_reviews
  ADD COLUMN IF NOT EXISTS learning_steps integer NOT NULL DEFAULT 0;

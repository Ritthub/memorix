-- Add missing INSERT / UPDATE / DELETE policies on the cards table.
-- Cards don't carry their own user_id; ownership is determined via
-- the linked theme_id or deck_id.

-- INSERT: the user must own the theme or deck being linked to.
CREATE POLICY IF NOT EXISTS "Users can insert own cards"
  ON public.cards
  FOR INSERT
  WITH CHECK (
    (theme_id IS NOT NULL AND
      auth.uid() = (SELECT user_id FROM public.themes WHERE id = theme_id))
    OR
    (deck_id IS NOT NULL AND
      auth.uid() = (SELECT user_id FROM public.decks WHERE id = deck_id))
  );

-- UPDATE: same ownership check.
CREATE POLICY IF NOT EXISTS "Users can update own cards"
  ON public.cards
  FOR UPDATE
  USING (
    auth.uid() = (SELECT user_id FROM public.themes WHERE id = theme_id)
    OR auth.uid() = (SELECT user_id FROM public.decks WHERE id = deck_id)
  );

-- DELETE: same ownership check.
CREATE POLICY IF NOT EXISTS "Users can delete own cards"
  ON public.cards
  FOR DELETE
  USING (
    auth.uid() = (SELECT user_id FROM public.themes WHERE id = theme_id)
    OR auth.uid() = (SELECT user_id FROM public.decks WHERE id = deck_id)
  );

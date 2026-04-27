-- Compound index for the most frequent query pattern:
-- card_reviews filtered by user_id + scheduled_at (due cards)
CREATE INDEX IF NOT EXISTS idx_card_reviews_user_scheduled
  ON card_reviews(user_id, scheduled_at);

-- Index for fetching rating history per card
CREATE INDEX IF NOT EXISTS idx_card_reviews_card_user_reviewed
  ON card_reviews(card_id, user_id, reviewed_at);

-- Index for loading all cards of a deck
CREATE INDEX IF NOT EXISTS idx_cards_deck_id
  ON cards(deck_id);

-- Index for loading all decks of a user
CREATE INDEX IF NOT EXISTS idx_decks_user_id
  ON decks(user_id);

-- Index for themes ordered by position per user
CREATE INDEX IF NOT EXISTS idx_themes_user_position
  ON themes(user_id, position);

-- Manual migration: partial deck_id → theme_id backfill
--
-- Purpose: align cards on theme_id as the primary owner without losing data.
-- Run in three explicit steps (diagnostic → backfill → diagnostic) so the
-- operator can confirm row counts before and after, and stop early if the
-- pre-state looks unexpected.
--
-- Safety:
--   * Only updates cards whose deck has an existing theme_id.
--   * Never touches archived cards.
--   * Never touches orphan cards (deck_id IS NULL AND theme_id IS NULL).
--   * Never sets theme_id to a synthetic fallback — that is a separate task.
--   * Run inside a transaction if you want to roll back.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Diagnostic — before backfill
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  COUNT(*) FILTER (WHERE theme_id IS NOT NULL AND deck_id IS NOT NULL) AS les_deux,
  COUNT(*) FILTER (WHERE theme_id IS NOT NULL AND deck_id IS NULL)     AS theme_seulement,
  COUNT(*) FILTER (WHERE theme_id IS NULL AND deck_id IS NOT NULL)     AS deck_seulement,
  COUNT(*) FILTER (WHERE theme_id IS NULL AND deck_id IS NULL)         AS orphelines
FROM cards
WHERE archived IS NOT TRUE;

SELECT COUNT(*) AS deck_seulement_sans_theme_deck
FROM cards c
JOIN decks d ON d.id = c.deck_id
WHERE c.theme_id IS NULL
  AND c.deck_id IS NOT NULL
  AND d.theme_id IS NULL
  AND c.archived IS NOT TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Partial backfill — only cards whose deck already has a theme_id
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE cards c
SET theme_id = d.theme_id
FROM decks d
WHERE c.deck_id = d.id
  AND c.theme_id IS NULL
  AND d.theme_id IS NOT NULL
  AND c.archived IS NOT TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Diagnostic — after backfill
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  COUNT(*) FILTER (WHERE theme_id IS NOT NULL AND deck_id IS NOT NULL) AS les_deux,
  COUNT(*) FILTER (WHERE theme_id IS NOT NULL AND deck_id IS NULL)     AS theme_seulement,
  COUNT(*) FILTER (WHERE theme_id IS NULL AND deck_id IS NOT NULL)     AS deck_seulement,
  COUNT(*) FILTER (WHERE theme_id IS NULL AND deck_id IS NULL)         AS orphelines
FROM cards
WHERE archived IS NOT TRUE;

SELECT COUNT(*) AS cartes_actives_sans_theme
FROM cards
WHERE theme_id IS NULL
  AND archived IS NOT TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Index — accelerate the new theme-driven read paths
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cards_theme_id_archived
  ON cards(theme_id, archived);

NOTIFY pgrst, 'reload schema';

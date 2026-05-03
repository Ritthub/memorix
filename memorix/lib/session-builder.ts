import { Card } from '@/types'

export function buildSession(dueCards: Card[]): Card[] {
  const shuffled = shuffle(dueCards)
  if (shuffled.length <= 5) return shuffled

  // theme_id > deck_id — priorité au thème direct, fallback deck pour les cartes non migrées
  function getGroupKey(c: Card): string {
    return c.theme_id || c.deck_id || 'unknown'
  }

  const result: Card[] = []
  const remaining = [...shuffled]
  let lastGroupKey: string | undefined

  while (remaining.length > 0) {
    const idx = remaining.findIndex(c => getGroupKey(c) !== lastGroupKey)
    if (idx === -1) {
      result.push(...remaining.splice(0))
    } else {
      const [card] = remaining.splice(idx, 1)
      result.push(card)
      lastGroupKey = getGroupKey(card)
    }
  }

  return result
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
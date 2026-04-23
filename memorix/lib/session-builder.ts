import { Card } from '@/types'

export function buildSession(dueCards: Card[]): Card[] {
  if (dueCards.length <= 5) return shuffle(dueCards)

  const result: Card[] = []
  const remaining = [...dueCards]
  let lastTheme: string | undefined

  while (remaining.length > 0) {
    // Cherche une carte d'un theme different
    const idx = remaining.findIndex(c => c.theme !== lastTheme)
    if (idx === -1) {
      // Toutes les cartes restantes ont le même theme
      result.push(...remaining.splice(0))
    } else {
      const [card] = remaining.splice(idx, 1)
      result.push(card)
      lastTheme = card.theme
    }
  }

  return result
}

export function reinsertFailed(failedCard: Card, queue: Card[]): Card[] {
  // Réinsère la carte après au moins 3 cartes d'un theme différent
  const insertAfter = Math.min(3, queue.length)
  let insertIdx = insertAfter

  for (let i = insertAfter; i < queue.length; i++) {
    if (queue[i].theme !== failedCard.theme) {
      insertIdx = i + 1
      break
    }
  }

  const result = [...queue]
  result.splice(insertIdx, 0, failedCard)
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
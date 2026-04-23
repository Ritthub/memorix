import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs'
import { CardReview, Rating as AppRating } from '@/types'

interface ScheduleOptions {
  userEdited?: boolean
  createdByAi?: boolean
  successRate?: number
}

export function scheduleCard(
  review: Partial<CardReview>,
  rating: AppRating,
  retentionTarget?: number,
  options?: ScheduleOptions
) {
  const target = retentionTarget ?? 0.9
  const opts = options ?? {}
  const p = generatorParameters({ request_retention: target })
  const scheduler = fsrs(p)

  const isNew = !review.state || review.state === 'new' || review.reps === 0

  // Toujours partir d'une carte vierge et copier les propriétés
  const baseCard = createEmptyCard(new Date())
  const card = isNew ? baseCard : {
    ...baseCard,
    due: review.scheduled_at ? new Date(review.scheduled_at) : new Date(),
    stability: review.stability || 1,
    difficulty: review.difficulty || 5,
    elapsed_days: review.elapsed_days || 0,
    scheduled_days: review.scheduled_days || 0,
    reps: review.reps || 0,
    lapses: review.lapses || 0,
    state: stateFromString(review.state || 'new'),
    last_review: review.reviewed_at ? new Date(review.reviewed_at) : undefined,
  }

  const fsrsRating = rating as unknown as Rating
  const results = scheduler.repeat(card, new Date())
  const scheduled = results[fsrsRating].card

  let stabilityBonus = 1.0
  if (opts.createdByAi === false) stabilityBonus = 1.2
  else if (opts.userEdited === true) stabilityBonus = 1.1

  let scheduleMultiplier = 1.0
  const reps = review.reps || 0
  const successRate = opts.successRate ?? 1.0
  if (reps < 3 && successRate < 0.8) {
    const expansiveFactors = [0.5, 0.75, 1.0]
    scheduleMultiplier = expansiveFactors[Math.min(reps, 2)]
  }

  const finalStability = scheduled.stability * stabilityBonus
  const finalScheduledDays = Math.max(1, Math.round(scheduled.scheduled_days * scheduleMultiplier))
  const finalDue = new Date()
  finalDue.setDate(finalDue.getDate() + finalScheduledDays)

  return {
    stability: finalStability,
    difficulty: scheduled.difficulty,
    retrievability: finalStability > 0
      ? Math.exp(Math.log(target) / finalStability)
      : 1,
    state: stateToString(scheduled.state),
    scheduled_at: finalDue.toISOString(),
    elapsed_days: scheduled.elapsed_days,
    scheduled_days: finalScheduledDays,
    reps: scheduled.reps,
    lapses: scheduled.lapses,
  }
}

export function getForgettingCurve(stability: number, days: number[]) {
  return days.map(d => ({
    day: d,
    retention: Math.round(Math.exp(Math.log(0.9) / stability * d) * 100)
  }))
}

export function computeSuccessRate(reviews: Partial<CardReview>[]): number {
  if (!reviews.length) return 1.0
  const successes = reviews.filter(r => (r.rating || 0) >= 2).length
  return successes / reviews.length
}

function stateFromString(s: string): State {
  switch (s) {
    case 'learning': return State.Learning
    case 'review': return State.Review
    case 'relearning': return State.Relearning
    default: return State.New
  }
}

function stateToString(s: State): string {
  switch (s) {
    case State.Learning: return 'learning'
    case State.Review: return 'review'
    case State.Relearning: return 'relearning'
    default: return 'new'
  }
}

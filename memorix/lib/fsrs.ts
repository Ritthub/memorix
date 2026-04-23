import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs'
import { CardReview, Rating as AppRating } from '@/types'

export function scheduleCard(review: Partial<CardReview>, rating: AppRating, retentionTarget = 0.9) {
  const p = generatorParameters({ request_retention: retentionTarget })
  const scheduler = fsrs(p)

  const isNew = !review.state || review.state === 'new' || (review.reps === 0)

  const card = isNew
    ? createEmptyCard(new Date())
    : {
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

  // ts-fsrs retourne un objet avec les 4 ratings possibles
  const results = scheduler.repeat(card, new Date())
  const scheduled = results[fsrsRating].card

  return {
    stability: scheduled.stability,
    difficulty: scheduled.difficulty,
    retrievability: scheduled.stability > 0
      ? Math.exp(Math.log(retentionTarget) / scheduled.stability)
      : 1,
    state: stateToString(scheduled.state),
    scheduled_at: scheduled.due.toISOString(),
    elapsed_days: scheduled.elapsed_days,
    scheduled_days: scheduled.scheduled_days,
    reps: scheduled.reps,
    lapses: scheduled.lapses,
  }
}

export function getInitialStability(difficulty: number, userEdited: boolean, createdByAi: boolean) {
  let base = 1.0
  if (!createdByAi) base *= 1.2
  else if (userEdited) base *= 1.1
  if (difficulty <= 2) base *= 0.8
  if (difficulty >= 4) base *= 1.2
  return base
}

export function getForgettingCurve(stability: number, days: number[]) {
  return days.map(d => ({
    day: d,
    retention: Math.round(Math.exp(Math.log(0.9) / stability * d) * 100)
  }))
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
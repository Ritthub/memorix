export type Theme = {
  id: string
  user_id: string
  name: string
  color: string
  position: number
  parent_id?: string | null
  created_at: string
}

export type Profile = {
  id: string
  email: string
  name: string
  timezone: string
  daily_goal: number
  retention_target: number
  created_at: string
}

export type Deck = {
  id: string
  user_id: string
  name: string
  description: string
  color: string
  icon: string
  source_file_url?: string
  theme_id?: string | null
  position?: number
  created_at: string
  cards?: Card[]
  card_count?: number
  due_count?: number
}

export type Card = {
  id: string
  deck_id: string
  theme_id?: string | null
  question: string
  answer: string
  explanation?: string
  theme?: string
  difficulty: number
  created_by_ai: boolean
  user_edited: boolean
  user_edit_hint?: string
  created_at: string
  review?: CardReview
  archived?: boolean
  archived_at?: string | null
  auto_delete_at?: string | null
}

export type CardReview = {
  id: string
  card_id: string
  user_id: string
  rating: number
  stability: number
  difficulty: number
  retrievability: number
  state: 'new' | 'learning' | 'review' | 'relearning'
  scheduled_at: string
  reviewed_at?: string
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
}

export type Rating = 1 | 2 | 3 | 4
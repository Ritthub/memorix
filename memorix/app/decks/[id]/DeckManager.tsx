'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type Card = {
  id: string
  question: string
  answer: string
  explanation?: string
  theme?: string
  difficulty: number
  created_by_ai: boolean
  card_reviews?: any[]
}

type Deck = {
  id: string
  name: string
  description?: string
  icon: string
  color: string
}

export default function DeckManager({
  deck,
  initialCards,
  dueCount,
  userId,
}: {
  deck: Deck
  initialCards: Card[]
  dueCount: number
  userId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [cards, setCards] = useState<Card[]>(initialCards)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingCard, setEditingCard] = useState<Card | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)

  // Inline quick-add
  const [inlineQ, setInlineQ] = useState('')
  const [inlineA, setInlineA] = useState('')
  const [inlineSaved, setInlineSaved] = useState(false)
  const inlineQRef = useRef<HTMLTextAreaElement>(null)
  const inlineARef = useRef<HTMLTextAreaElement>(null)

  const allSelected = selected.size === cards.length && cards.length > 0

  function toggleSelect(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(cards.map(c => c.id)))
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    if (!confirm(`Supprimer ${selected.size} carte(s) ?`)) return
    setDeleting(true)
    const ids = [...selected]
    await supabase.from('card_reviews').delete().in('card_id', ids)
    await supabase.from('cards').delete().in('id', ids)
    setCards(cards.filter(c => !selected.has(c.id)))
    setSelected(new Set())
    setDeleting(false)
    router.refresh()
  }

  async function saveEdit() {
    if (!editingCard) return
    setSaving(true)
    await supabase.from('cards').update({
      question: editingCard.question,
      answer: editingCard.answer,
      explanation: editingCard.explanation,
      user_edited: true,
    }).eq('id', editingCard.id)
    setCards(cards.map(c => c.id === editingCard.id ? { ...c, ...editingCard } : c))
    setEditingCard(null)
    setSaving(false)
  }

  async function saveInline() {
    if (!inlineQ.trim() || !inlineA.trim()) return
    const q = inlineQ.trim()
    const a = inlineA.trim()

    // Optimistic update — add to top of list with temp id
    const tempId = `temp-${Date.now()}`
    setCards(prev => [{ id: tempId, question: q, answer: a, difficulty: 1, created_by_ai: false, user_edited: false }, ...prev])
    setInlineQ('')
    setInlineA('')
    setInlineSaved(true)
    setTimeout(() => setInlineSaved(false), 2000)
    inlineQRef.current?.focus()

    const { data: card } = await supabase
      .from('cards')
      .insert({ deck_id: deck.id, question: q, answer: a, difficulty: 1, created_by_ai: false, user_edited: false })
      .select('id')
      .single()

    if (card) {
      setCards(prev => prev.map(c => c.id === tempId ? { ...c, id: card.id } : c))
      await supabase.from('card_reviews').insert({
        card_id: card.id,
        user_id: userId,
        state: 'new',
        scheduled_at: new Date().toISOString(),
      })
    }
  }

  const cardCount = cards.length

  return (
    <div className="min-h-screen bg-[#0F172A] text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">← Retour</Link>
          <Link href={`/create?deckId=${deck.id}`} className="text-sm text-[#4338CA] hover:text-[#818CF8] transition-colors">
            + Ajouter des cartes
          </Link>
        </div>

        {/* Deck info */}
        <div className="bg-[#1E293B] rounded-2xl p-8 border border-[#334155] mb-6">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-4xl">{deck.icon}</span>
            <div>
              <h1 className="text-2xl font-bold">{deck.name}</h1>
              {deck.description && <p className="text-gray-400 mt-1">{deck.description}</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-[#0F172A] rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[#4338CA]">{cardCount}</div>
              <div className="text-gray-400 text-xs mt-1">Cartes total</div>
            </div>
            <div className="bg-[#0F172A] rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[#4338CA]">{dueCount}</div>
              <div className="text-gray-400 text-xs mt-1">À réviser</div>
            </div>
            <div className="bg-[#0F172A] rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[#4338CA]">
                {cardCount > 0 ? Math.round(((cardCount - dueCount) / cardCount) * 100) : 0}%
              </div>
              <div className="text-gray-400 text-xs mt-1">Maîtrisées</div>
            </div>
          </div>
        </div>

        {/* Bouton révision */}
        {dueCount > 0 && (
          <Link href={`/review/${deck.id}`} className="block w-full bg-[#4338CA] hover:bg-[#3730A3] rounded-2xl p-5 text-center text-lg font-bold mb-6 transition-colors">
            Réviser ce deck ({dueCount} cartes)
          </Link>
        )}

        {/* Barre d'actions */}
        {cards.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="w-4 h-4 accent-[#4338CA] cursor-pointer"
              />
              <span className="text-gray-400 text-sm">
                {selected.size > 0 ? `${selected.size} sélectionnée(s)` : `${cardCount} cartes`}
              </span>
            </div>
            {selected.size > 0 && (
              <button
                onClick={deleteSelected}
                disabled={deleting}
                className="text-sm text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400 px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
              >
                {deleting ? 'Suppression...' : `Supprimer (${selected.size})`}
              </button>
            )}
          </div>
        )}

        {/* Liste des cartes */}
        <div className="space-y-3">
          {cards.map(card => (
            <div
              key={card.id}
              className={`bg-[#1E293B] rounded-xl p-5 border transition-colors ${
                selected.has(card.id) ? 'border-[#4338CA]' : 'border-[#334155]'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(card.id)}
                  onChange={() => toggleSelect(card.id)}
                  className="w-4 h-4 accent-[#4338CA] cursor-pointer mt-1 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium mb-1">{card.question}</p>
                  <p className="text-[#818CF8] text-sm mb-1">{card.answer}</p>
                  {card.explanation && (
                    <p className="text-gray-500 text-xs">{card.explanation}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    {card.theme && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#0F172A] text-gray-400">{card.theme}</span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#0F172A] text-gray-400">
                      {card.card_reviews?.[0]?.state || 'new'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#0F172A] text-gray-400">
                      Difficulté {card.difficulty}/5
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setEditingCard({ ...card })}
                  className="text-gray-500 hover:text-white transition-colors flex-shrink-0 text-sm px-3 py-1 border border-gray-700 hover:border-gray-400 rounded-lg"
                >
                  Modifier
                </button>
              </div>
            </div>
          ))}
        </div>

        {cards.length === 0 && (
          <div className="text-center py-10 text-gray-500">
            <div className="text-4xl mb-4">📭</div>
            <p>Aucune carte dans ce deck</p>
          </div>
        )}

        {/* Inline quick-add */}
        <div className="mt-4 rounded-xl border-2 border-dashed border-[#334155] focus-within:border-solid focus-within:border-[#818CF8] transition-colors p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              ref={inlineQRef}
              value={inlineQ}
              onChange={e => setInlineQ(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Tab') { e.preventDefault(); inlineARef.current?.focus() }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveInline() }
              }}
              placeholder="Question…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-[#F1F5F9] placeholder-[#475569] outline-none resize-none"
            />
            <textarea
              ref={inlineARef}
              value={inlineA}
              onChange={e => setInlineA(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveInline() }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveInline() }
              }}
              placeholder="Réponse…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-[#818CF8] placeholder-[#475569] outline-none resize-none"
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              {inlineSaved && <span className="text-green-400 text-xs">✓ Carte ajoutée</span>}
              <button
                onClick={saveInline}
                disabled={!inlineQ.trim() || !inlineA.trim()}
                className="w-7 h-7 flex items-center justify-center bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 rounded-lg text-white text-base leading-none transition-colors flex-shrink-0"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal édition */}
      {editingCard && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#1E293B] rounded-2xl p-6 w-full max-w-lg border border-[#334155]">
            <h2 className="text-lg font-bold mb-4">Modifier la carte</h2>
            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Question</label>
                <textarea
                  value={editingCard.question}
                  onChange={e => setEditingCard({ ...editingCard, question: e.target.value })}
                  rows={3}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-[#818CF8] transition-colors resize-none"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Réponse</label>
                <textarea
                  value={editingCard.answer}
                  onChange={e => setEditingCard({ ...editingCard, answer: e.target.value })}
                  rows={3}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2 text-[#818CF8] text-sm focus:outline-none focus:border-[#818CF8] transition-colors resize-none"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Explication (optionnel)</label>
                <textarea
                  value={editingCard.explanation || ''}
                  onChange={e => setEditingCard({ ...editingCard, explanation: e.target.value })}
                  rows={2}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2 text-gray-400 text-sm focus:outline-none focus:border-[#818CF8] transition-colors resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditingCard(null)}
                className="flex-1 border border-gray-700 hover:border-gray-400 rounded-xl py-2 text-gray-400 hover:text-white transition-colors text-sm"
              >
                Annuler
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 rounded-xl py-2 font-medium transition-colors text-sm"
              >
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

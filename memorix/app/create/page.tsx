cat > /workspaces/memorix/memorix/app/create/page.tsx << 'ENDOFFILE'
'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function CreatePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const existingDeckId = searchParams.get('deckId')
  const supabase = createClient()

  const [step, setStep] = useState<'deck' | 'cards'>(existingDeckId ? 'cards' : 'deck')
  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [pdfName, setPdfName] = useState('')
  const [deckId, setDeckId] = useState(existingDeckId || '')
  const [deckName, setDeckName] = useState('')
  const [deck, setDeck] = useState({ name: '', description: '', icon: '📚', color: '#534AB7' })
  const [cards, setCards] = useState([{ question: '', answer: '', explanation: '' }])
  const [aiText, setAiText] = useState('')
  const [aiCards, setAiCards] = useState<any[]>([])
  const [aiError, setAiError] = useState('')

  const icons = ['📚', '💼', '🧠', '🌍', '⚖️', '💊', '🏛️', '🔬', '💰', '🎯']

  useEffect(() => {
    async function fetchDeck() {
      if (!existingDeckId) return
      const { data } = await supabase.from('decks').select('name').eq('id', existingDeckId).single()
      if (data) setDeckName(data.name)
    }
    fetchDeck()
  }, [existingDeckId])

  async function extractPdfText(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/extract-pdf', { method: 'POST', body: formData })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data.text
  }

  async function handleFile(file?: File) {
    if (!file || file.type !== 'application/pdf') {
      setAiError('Veuillez choisir un fichier PDF.')
      return
    }
    setExtracting(true)
    setAiError('')
    setPdfName(file.name)
    try {
      const text = await extractPdfText(file)
      setAiText(text)
    } catch (e) {
      setAiError('Erreur lors de la lecture du PDF.')
      setPdfName('')
    } finally {
      setExtracting(false)
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    await handleFile(file)
  }

  async function createDeck() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('decks').insert({ ...deck, user_id: user.id }).select().single()
    if (!error && data) { setDeckId(data.id); setStep('cards') }
    setLoading(false)
  }

  async function generateCards() {
    if (!aiText.trim() || aiText.length < 50) {
      setAiError('Le texte doit faire au moins 50 caractères.')
      return
    }
    setGenerating(true)
    setAiError('')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText })
      })
      const data = await res.json()
      if (data.error) { setAiError(data.error); return }
      setAiCards(data.cards || [])
    } catch {
      setAiError('Erreur de connexion.')
    } finally {
      setGenerating(false)
    }
  }

  async function saveCards(cardsToSave: any[]) {
    if (loading) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('cards').insert(
      cardsToSave.map(c => ({
        deck_id: deckId,
        question: c.question || c.q,
        answer: c.answer || c.a,
        explanation: c.explanation || c.expl || null,
        theme: c.theme || null,
        difficulty: c.difficulty || 3,
        created_by_ai: mode === 'ai',
      }))
    )

    if (!error) {
      const { data: allCards } = await supabase.from('cards').select('id').eq('deck_id', deckId)
      const { data: existingReviews } = await supabase.from('card_reviews').select('card_id').eq('user_id', user.id)
      const existingIds = new Set(existingReviews?.map(r => r.card_id) || [])
      const newCards = allCards?.filter(c => !existingIds.has(c.id)) || []
      if (newCards.length > 0) {
        await supabase.from('card_reviews').insert(
          newCards.map(card => ({ card_id: card.id, user_id: user.id, state: 'new', scheduled_at: new Date().toISOString() }))
        )
      }
      router.push(`/decks/${deckId}`)
    }
    setLoading(false)
  }

  function addCard() { setCards([...cards, { question: '', answer: '', explanation: '' }]) }
  function updateCard(idx: number, field: string, value: string) {
    setCards(cards.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }
  function removeCard(idx: number) { if (cards.length > 1) setCards(cards.filter((_, i) => i !== idx)) }
  function updateAiCard(idx: number, field: string, value: string) {
    setAiCards(aiCards.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }
  function removeAiCard(idx: number) { setAiCards(aiCards.filter((_, i) => i !== idx)) }

  if (step === 'deck') return (
    <div className="min-h-screen bg-[#0D0D1A] text-white px-6 py-10">
      <div className="max-w-lg mx-auto">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white mb-8 block transition-colors">← Retour</button>
        <h1 className="text-3xl font-bold mb-8">Nouveau deck</h1>
        <div className="space-y-6">
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Nom du deck</label>
            <input value={deck.name} onChange={e => setDeck({ ...deck, name: e.target.value })}
              placeholder="Ex: Term-sheet ISAI, Espagnol B2..."
              className="w-full bg-[#1A1A2E] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors" />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Description (optionnel)</label>
            <textarea value={deck.description} onChange={e => setDeck({ ...deck, description: e.target.value })}
              placeholder="Décrivez le contenu de ce deck..." rows={3}
              className="w-full bg-[#1A1A2E] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors resize-none" />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Icône</label>
            <div className="flex gap-3 flex-wrap">
              {icons.map(icon => (
                <button key={icon} onClick={() => setDeck({ ...deck, icon })}
                  className={`text-2xl p-2 rounded-xl transition-colors ${deck.icon === icon ? 'bg-[#534AB7]' : 'bg-[#1A1A2E] hover:bg-[#534AB7]/30'}`}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <button onClick={createDeck} disabled={!deck.name || loading}
            className="w-full bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-40 rounded-xl py-3 font-medium transition-colors">
            {loading ? 'Création...' : 'Créer le deck →'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0D0D1A] text-white px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => existingDeckId ? router.push(`/decks/${deckId}`) : setStep('deck')}
            className="text-gray-400 hover:text-white transition-colors">← Retour</button>
          <h1 className="text-lg font-bold">{deckName ? `"${deckName}"` : 'Ajouter des cartes'}</h1>
          <div className="w-16" />
        </div>

        <div className="flex gap-2 mb-8 bg-[#1A1A2E] p-1 rounded-xl">
          <button onClick={() => setMode('manual')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-[#534AB7] text-white' : 'text-gray-400 hover:text-white'}`}>
            Saisie manuelle
          </button>
          <button onClick={() => setMode('ai')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'ai' ? 'bg-[#534AB7] text-white' : 'text-gray-400 hover:text-white'}`}>
            Générer avec Claude
          </button>
        </div>

        {mode === 'manual' && (
          <div>
            <div className="space-y-4 mb-6">
              {cards.map((card, idx) => (
                <div key={idx} className="bg-[#1A1A2E] rounded-2xl p-6 border border-[#534AB7]/20">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-gray-400 text-sm font-medium">Carte {idx + 1}</span>
                    {cards.length > 1 && (
                      <button onClick={() => removeCard(idx)} className="text-red-400 hover:text-red-300 text-sm transition-colors">Supprimer</button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <input value={card.question} onChange={e => updateCard(idx, 'question', e.target.value)}
                      placeholder="Question..." className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors" />
                    <input value={card.answer} onChange={e => updateCard(idx, 'answer', e.target.value)}
                      placeholder="Réponse..." className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors" />
                    <input value={card.explanation} onChange={e => updateCard(idx, 'explanation', e.target.value)}
                      placeholder="Explication (optionnel)..." className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={addCard} className="flex-1 border border-[#534AB7]/30 hover:border-[#534AB7] rounded-xl py-3 text-gray-400 hover:text-white transition-colors">
                + Ajouter une carte
              </button>
              <button onClick={() => saveCards(cards)} disabled={!cards.some(c => c.question && c.answer) || loading}
                className="flex-1 bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 font-medium transition-colors">
                {loading ? '⏳ Sauvegarde...' : 'Sauvegarder →'}
              </button>
            </div>
          </div>
        )}

        {mode === 'ai' && (
          <div>
            {aiCards.length === 0 ? (
              <div className="space-y-4">
                {/* Upload PDF */}
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Option 1 — Uploadez un PDF</label>
                  <label
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                      dragOver ? 'border-[#534AB7] bg-[#534AB7]/10' : 'border-[#534AB7]/30 hover:border-[#534AB7]/60'
                    }`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                  >
                    <input type="file" accept=".pdf" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
                    {extracting ? (
                      <div className="text-center">
                        <div className="text-2xl mb-2">⏳</div>
                        <p className="text-gray-400 text-sm">Extraction du texte en cours...</p>
                      </div>
                    ) : pdfName ? (
                      <div className="text-center">
                        <div className="text-2xl mb-2">📄</div>
                        <p className="text-white text-sm font-medium">{pdfName}</p>
                        <p className="text-gray-500 text-xs mt-1">Texte extrait ({aiText.length} caractères)</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-2xl mb-2">📎</div>
                        <p className="text-gray-400 text-sm">Glissez un PDF ici ou cliquez pour choisir</p>
                      </div>
                    )}
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[#534AB7]/20" />
                  <span className="text-gray-600 text-xs">ou</span>
                  <div className="flex-1 h-px bg-[#534AB7]/20" />
                </div>

                {/* Texte libre */}
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Option 2 — Collez votre texte</label>
                  <textarea value={aiText} onChange={e => { setAiText(e.target.value); setPdfName('') }}
                    placeholder="Collez ici votre texte, vos notes, un résumé, un term-sheet..." rows={8}
                    className="w-full bg-[#1A1A2E] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors resize-none" />
                  <p className="text-gray-600 text-xs mt-1">{aiText.length} caractères</p>
                </div>

                {aiError && <p className="text-red-400 text-sm">{aiError}</p>}
                <button onClick={generateCards} disabled={generating || aiText.length < 50}
                  className="w-full bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-40 rounded-xl py-3 font-medium transition-colors">
                  {generating ? 'Claude analyse votre document...' : 'Générer les flashcards avec Claude →'}
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-gray-400 text-sm">{aiCards.length} cartes générées — modifiez avant d'importer</p>
                  <button onClick={() => { setAiCards([]); setPdfName('') }} className="text-gray-500 hover:text-white text-sm transition-colors">Recommencer</button>
                </div>
                <div className="space-y-4 mb-6">
                  {aiCards.map((card, idx) => (
                    <div key={idx} className="bg-[#1A1A2E] rounded-2xl p-6 border border-[#534AB7]/20">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {card.theme && <span className="text-xs px-2 py-1 bg-[#534AB7]/20 text-[#AFA9EC] rounded-full">{card.theme}</span>}
                          <span className="text-xs text-gray-500">Difficulté {card.difficulty}/5</span>
                        </div>
                        <button onClick={() => removeAiCard(idx)} className="text-red-400 hover:text-red-300 text-sm transition-colors">Supprimer</button>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-gray-500 text-xs mb-1 block">Question</label>
                          <textarea value={card.q || ''} onChange={e => updateAiCard(idx, 'q', e.target.value)} rows={2}
                            className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7] transition-colors resize-none" />
                        </div>
                        <div>
                          <label className="text-gray-500 text-xs mb-1 block">Réponse</label>
                          <textarea value={card.a || ''} onChange={e => updateAiCard(idx, 'a', e.target.value)} rows={2}
                            className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-2 text-[#AFA9EC] text-sm focus:outline-none focus:border-[#534AB7] transition-colors resize-none" />
                        </div>
                        <div>
                          <label className="text-gray-500 text-xs mb-1 block">Explication (optionnel)</label>
                          <textarea value={card.expl || ''} onChange={e => updateAiCard(idx, 'expl', e.target.value)} rows={1}
                            className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-2 text-gray-500 text-sm focus:outline-none focus:border-[#534AB7] transition-colors resize-none" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { if (!loading) saveCards(aiCards) }}
                  disabled={aiCards.length === 0 || loading}
                  className="w-full bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 font-medium transition-colors">
                  {loading ? '⏳ Import en cours...' : `Importer ${aiCards.length} cartes →`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0D0D1A]" />}>
      <CreatePageInner />
    </Suspense>
  )
}
ENDOFFILE
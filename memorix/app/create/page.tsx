'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const WIKI_PRIORITIES = [
  'Dates & faits clés',
  'Personnages',
  'Causes & effets',
  'Concepts clés',
  'Chiffres importants',
  'Chronologie',
]

function CreatePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const existingDeckId = searchParams.get('deckId')
  const themeId = searchParams.get('themeId')
  const supabase = createClient()

  const [step, setStep] = useState<'deck' | 'cards'>(existingDeckId ? 'cards' : 'deck')
  const [mode, setMode] = useState<'manual' | 'ai' | 'wikipedia'>('manual')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [pdfName, setPdfName] = useState('')
  const [deckId, setDeckId] = useState(existingDeckId || '')
  const [deckName, setDeckName] = useState('')
  const [deck, setDeck] = useState({ name: '', description: '', icon: '📚', color: '#4338CA' })
  const [directThemeId, setDirectThemeId] = useState('')
  const [selectedLeafTheme, setSelectedLeafTheme] = useState('')
  const [leafThemes, setLeafThemes] = useState<Array<{ id: string; name: string; color: string }>>([])

  const [cards, setCards] = useState([{ question: '', answer: '', explanation: '' }])
  const [aiText, setAiText] = useState('')
  const [aiCards, setAiCards] = useState<any[]>([])
  const [aiError, setAiError] = useState('')

  // Wikipedia state
  const [wikiStep, setWikiStep] = useState<'search' | 'article' | 'params' | 'cards'>('search')
  const [wikiQuery, setWikiQuery] = useState('')
  const [wikiResults, setWikiResults] = useState<Array<[string, string]>>([])
  const [wikiTitle, setWikiTitle] = useState('')
  const [wikiSummary, setWikiSummary] = useState('')   // exintro=true, for display
  const [wikiDeckName, setWikiDeckName] = useState('') // editable deck name pre-filled from title
  const [wikiSearchLoading, setWikiSearchLoading] = useState(false)
  const [wikiArticleLoading, setWikiArticleLoading] = useState(false)
  const [wikiMaxCards, setWikiMaxCards] = useState(15)
  const [wikiPriorities, setWikiPriorities] = useState<Set<string>>(new Set())
  const [wikiError, setWikiError] = useState('')

  const icons = ['📚', '💼', '🧠', '🌍', '⚖️', '💊', '🏛️', '🔬', '💰', '🎯']

  useEffect(() => {
    async function fetchDeck() {
      if (!existingDeckId) return
      const { data } = await supabase.from('decks').select('name').eq('id', existingDeckId).single()
      if (data) setDeckName(data.name)
    }
    fetchDeck()
  }, [existingDeckId])

  useEffect(() => {
    async function loadLeafThemes() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: themesData }, { data: decksData }] = await Promise.all([
        supabase.from('themes').select('id, name, color, parent_id').eq('user_id', user.id),
        supabase.from('decks').select('id, theme_id').eq('user_id', user.id),
      ])
      const parentIds = new Set((themesData || []).filter((t: any) => t.parent_id).map((t: any) => t.parent_id))
      const themesWithDecks = new Set((decksData || []).map((d: any) => d.theme_id).filter(Boolean))
      const leaves = (themesData || []).filter((t: any) => !parentIds.has(t.id) && !themesWithDecks.has(t.id))
      setLeafThemes(leaves)
      if (leaves.length > 0) setSelectedLeafTheme(leaves[0].id)
    }
    loadLeafThemes()
  }, [])

  // Wikipedia search debounce
  useEffect(() => {
    if (wikiQuery.trim().length < 2) { setWikiResults([]); return }
    const t = setTimeout(async () => {
      setWikiSearchLoading(true)
      try {
        const res = await fetch(
          `https://fr.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(wikiQuery)}&limit=6&format=json&origin=*`
        )
        const data = await res.json()
        const titles = (data[1] as string[]) || []
        const descs = (data[2] as string[]) || []
        setWikiResults(titles.map((t, i) => [t, descs[i] || '']))
      } catch {
        // silently ignore — user can retry
      } finally {
        setWikiSearchLoading(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [wikiQuery])

  // Fetch article summary (exintro=true) for the preview step
  async function fetchWikiArticle(title: string) {
    setWikiArticleLoading(true)
    setWikiError('')
    try {
      const res = await fetch(
        `https://fr.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&exintro=true&explaintext=true&format=json&origin=*`
      )
      const data = await res.json()
      const pages = data.query?.pages || {}
      const page = Object.values(pages)[0] as any
      if (!page || 'missing' in page) {
        setWikiError('Article non trouvé.')
        return
      }
      setWikiTitle(page.title)
      setWikiSummary(page.extract || '')
      setWikiDeckName(page.title)
      setWikiStep('article')
    } catch {
      setWikiError("Impossible de charger l'article Wikipedia. Vérifiez votre connexion.")
    } finally {
      setWikiArticleLoading(false)
    }
  }

  function toggleWikiPriority(p: string) {
    setWikiPriorities(prev => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }

  // On generate: fetch the FULL article first, then call Claude with all of it
  async function generateFromWiki() {
    setGenerating(true)
    setWikiError('')
    try {
      // Fetch complete article content (no exintro limit)
      const articleRes = await fetch(
        `https://fr.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=extracts&explaintext=true&format=json&origin=*`
      )
      const articleData = await articleRes.json()
      const pages = articleData.query?.pages || {}
      const page = Object.values(pages)[0] as any
      const fullText = page?.extract || wikiSummary
      if (!fullText) { setWikiError("Impossible de récupérer le contenu de l'article."); return }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: fullText,
          title: wikiTitle,
          maxCards: wikiMaxCards,
          priorities: Array.from(wikiPriorities),
          source: 'wikipedia',
        }),
      })
      const data = await res.json()
      if (data.error) { setWikiError(data.error); return }
      setAiCards(data.cards || [])
      setWikiStep('cards')
    } catch {
      setWikiError('Erreur de génération. Vérifiez votre connexion.')
    } finally {
      setGenerating(false)
    }
  }

  async function saveWikiCards() {
    if (loading) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: newDeck, error: deckError } = await supabase
      .from('decks')
      .insert({ name: wikiDeckName || wikiTitle, description: 'Importé depuis Wikipedia', icon: '🌍', color: '#4338CA', user_id: user.id, ...(themeId ? { theme_id: themeId } : {}) })
      .select()
      .single()
    if (deckError || !newDeck) { setLoading(false); return }

    const targetDeckId = newDeck.id

    const { error } = await supabase.from('cards').insert(
      aiCards.map(c => ({
        deck_id: targetDeckId,
        question: c.q,
        answer: c.a,
        explanation: c.expl || null,
        theme: c.theme || null,
        difficulty: c.difficulty || 3,
        created_by_ai: true,
      }))
    )

    if (!error) {
      const { data: allCards } = await supabase.from('cards').select('id').eq('deck_id', targetDeckId)
      const { data: existingReviews } = await supabase.from('card_reviews').select('card_id').eq('user_id', user.id)
      const existingIds = new Set(
        (existingReviews as { card_id: string }[])?.map((r: { card_id: string }) => r.card_id) || []
      )
      const newCards = (allCards as { id: string }[])?.filter((c: { id: string }) => !existingIds.has(c.id)) || []
      if (newCards.length > 0) {
        await supabase.from('card_reviews').insert(
          (newCards as { id: string }[]).map((card: { id: string }) => ({ card_id: card.id, user_id: user.id, state: 'new', scheduled_at: new Date().toISOString() }))
        )
      }
      router.push(`/decks/${targetDeckId}`)
    }
    setLoading(false)
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
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/extract-pdf', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiText(data.text)
      await generateCardsFromText(data.text)
    } catch {
      setAiError('Erreur lors de la lecture du PDF.')
      setPdfName('')
    } finally {
      setExtracting(false)
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    await handleFile(e.dataTransfer.files[0])
  }

  async function createDeck() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data, error } = await supabase.from('decks').insert({ ...deck, user_id: user.id, ...(themeId ? { theme_id: themeId } : {}) }).select().single()
    if (!error && data) { setDeckId(data.id); setStep('cards') }
    setLoading(false)
  }

  async function generateCardsFromText(text: string) {
    if (!text || text.length < 50) return
    setGenerating(true)
    setAiError('')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      const data = await res.json()
      if (data.error) { setAiError(data.error); return }
      setAiCards(data.cards || [])
    } catch {
      setAiError('Erreur de génération.')
    } finally {
      setGenerating(false)
    }
  }

  async function generateCards() {
    if (!aiText.trim() || aiText.length < 50) {
      setAiError('Le texte doit faire au moins 50 caractères.')
      return
    }
    await generateCardsFromText(aiText)
  }

  async function saveCards(cardsToSave: any[]) {
    if (loading) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const targetThemeId = directThemeId
    const targetDeckId = deckId

    const { error } = await supabase.from('cards').insert(
      cardsToSave.map(c => ({
        ...(targetThemeId ? { theme_id: targetThemeId } : { deck_id: targetDeckId }),
        question: c.question || c.q,
        answer: c.answer || c.a,
        explanation: c.explanation || c.expl || null,
        theme: c.theme || null,
        difficulty: c.difficulty || 3,
        created_by_ai: mode === 'ai',
      }))
    )

    if (!error) {
      const allCardsQuery = targetThemeId
        ? supabase.from('cards').select('id').eq('theme_id', targetThemeId).is('deck_id', null)
        : supabase.from('cards').select('id').eq('deck_id', targetDeckId)
      const { data: allCards } = await allCardsQuery
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingReviews } = await supabase.from('card_reviews').select('card_id').eq('user_id', user.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingIds = new Set((existingReviews as any[])?.map((r: any) => r.card_id) || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newCards = (allCards as any[])?.filter((c: any) => !existingIds.has(c.id)) || []
      if (newCards.length > 0) {
        await supabase.from('card_reviews').insert(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (newCards as any[]).map((card: any) => ({ card_id: card.id, user_id: user.id, state: 'new', scheduled_at: new Date().toISOString() }))
        )
      }
      router.push(targetThemeId ? `/themes/${targetThemeId}` : `/decks/${targetDeckId}`)
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

  function enterWikiMode() {
    setMode('wikipedia')
    setWikiStep('search')
    setStep('cards')
  }

  if (step === 'deck') return (
    <div className="min-h-screen bg-[#0F172A] text-white px-6 py-10">
      <div className="max-w-lg mx-auto">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white mb-8 block transition-colors">← Retour</button>
        <h1 className="text-3xl font-bold mb-8">Nouveau deck</h1>
        <div className="space-y-6">
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Nom du deck</label>
            <input value={deck.name} onChange={e => setDeck({ ...deck, name: e.target.value })}
              placeholder="Ex: Term-sheet ISAI, Espagnol B2..."
              className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#818CF8] transition-colors" />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Description (optionnel)</label>
            <textarea value={deck.description} onChange={e => setDeck({ ...deck, description: e.target.value })}
              placeholder="Décrivez le contenu de ce deck..." rows={3}
              className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#818CF8] transition-colors resize-none" />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Icône</label>
            <div className="flex gap-3 flex-wrap">
              {icons.map(icon => (
                <button key={icon} onClick={() => setDeck({ ...deck, icon })}
                  className={`text-2xl p-2 rounded-xl transition-colors ${deck.icon === icon ? 'bg-[#4338CA]' : 'bg-[#1E293B] hover:bg-[#4338CA]/30'}`}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <button onClick={createDeck} disabled={!deck.name || loading}
            className="w-full bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 rounded-xl py-3 font-medium transition-colors">
            {loading ? 'Création...' : 'Créer le deck →'}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#312E81]/30" />
            <span className="text-gray-600 text-xs">ou</span>
            <div className="flex-1 h-px bg-[#312E81]/30" />
          </div>

          <button onClick={enterWikiMode}
            className="w-full border border-[#334155] hover:border-[#818CF8]/50 rounded-xl py-3 text-gray-400 hover:text-white transition-colors text-sm">
            🌐 Importer depuis Wikipedia →
          </button>

          {leafThemes.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#312E81]/30" />
                <span className="text-gray-600 text-xs">ou</span>
                <div className="flex-1 h-px bg-[#312E81]/30" />
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">Attacher directement à un thème</label>
                <select
                  value={selectedLeafTheme}
                  onChange={e => setSelectedLeafTheme(e.target.value)}
                  className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#818CF8] transition-colors mb-3"
                >
                  {leafThemes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const theme = leafThemes.find(t => t.id === selectedLeafTheme)
                    if (!theme) return
                    setDirectThemeId(selectedLeafTheme)
                    setDeckName(theme.name)
                    setStep('cards')
                  }}
                  disabled={!selectedLeafTheme}
                  className="w-full border border-[#4338CA]/50 hover:border-[#818CF8] hover:bg-[#312E81]/20 disabled:opacity-40 rounded-xl py-3 text-[#818CF8] transition-colors text-sm"
                >
                  📝 Ajouter des cartes directement →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0F172A] text-white px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => {
            if (existingDeckId) router.push(`/decks/${deckId}`)
            else { setDirectThemeId(''); setStep('deck') }
          }} className="text-gray-400 hover:text-white transition-colors">← Retour</button>
          <h1 className="text-lg font-bold">{deckName ? `"${deckName}"` : 'Ajouter des cartes'}</h1>
          <div className="w-16" />
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-8 bg-[#1E293B] p-1 rounded-xl">
          <button onClick={() => setMode('manual')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-[#4338CA] text-white' : 'text-gray-400 hover:text-white'}`}>
            Saisie manuelle
          </button>
          <button onClick={() => setMode('ai')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'ai' ? 'bg-[#4338CA] text-white' : 'text-gray-400 hover:text-white'}`}>
            Générer avec Claude
          </button>
          <button onClick={() => { setMode('wikipedia'); setWikiStep('search') }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'wikipedia' ? 'bg-[#4338CA] text-white' : 'text-gray-400 hover:text-white'}`}>
            Wikipedia
          </button>
        </div>

        {/* Manual mode */}
        {mode === 'manual' && (
          <div>
            <div className="space-y-4 mb-6">
              {cards.map((card, idx) => (
                <div key={idx} className="bg-[#1E293B] rounded-2xl p-6 border border-[#334155]">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-gray-400 text-sm font-medium">Carte {idx + 1}</span>
                    {cards.length > 1 && (
                      <button onClick={() => removeCard(idx)} className="text-red-400 hover:text-red-300 text-sm transition-colors">Supprimer</button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <input value={card.question} onChange={e => updateCard(idx, 'question', e.target.value)}
                      placeholder="Question..." className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#818CF8] transition-colors" />
                    <input value={card.answer} onChange={e => updateCard(idx, 'answer', e.target.value)}
                      placeholder="Réponse..." className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#818CF8] transition-colors" />
                    <input value={card.explanation} onChange={e => updateCard(idx, 'explanation', e.target.value)}
                      placeholder="Explication (optionnel)..." className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#818CF8] transition-colors" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={addCard} className="flex-1 border border-[#334155] hover:border-[#4338CA] rounded-xl py-3 text-gray-400 hover:text-white transition-colors">
                + Ajouter une carte
              </button>
              <button onClick={() => saveCards(cards)} disabled={!cards.some(c => c.question && c.answer) || loading}
                className="flex-1 bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 font-medium transition-colors">
                {loading ? '⏳ Sauvegarde...' : 'Sauvegarder →'}
              </button>
            </div>
          </div>
        )}

        {/* AI mode */}
        {mode === 'ai' && (
          <div>
            {aiCards.length === 0 ? (
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Option 1 — Uploadez un PDF</label>
                  <label
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                      dragOver ? 'border-[#4338CA] bg-[#312E81]/20' : 'border-[#334155] hover:border-[#818CF8]/50'
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
                        <div className="text-2xl mb-2">{generating ? '🧠' : '📄'}</div>
                        <p className="text-white text-sm font-medium">{pdfName}</p>
                        <p className="text-gray-500 text-xs mt-1">
                          {generating ? 'Claude génère les cartes...' : `Texte extrait (${aiText.length} caractères)`}
                        </p>
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
                  <div className="flex-1 h-px bg-[#312E81]/30" />
                  <span className="text-gray-600 text-xs">ou</span>
                  <div className="flex-1 h-px bg-[#312E81]/30" />
                </div>

                <div>
                  <label className="text-gray-400 text-sm mb-2 block">Option 2 — Collez votre texte</label>
                  <textarea value={aiText} onChange={e => { setAiText(e.target.value); setPdfName('') }}
                    placeholder="Collez ici votre texte, vos notes, un résumé, un term-sheet..." rows={8}
                    className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#818CF8] transition-colors resize-none" />
                  <p className="text-gray-600 text-xs mt-1">{aiText.length} caractères</p>
                </div>

                {aiError && <p className="text-red-400 text-sm">{aiError}</p>}
                <button onClick={generateCards} disabled={generating || aiText.length < 50}
                  className="w-full bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 rounded-xl py-3 font-medium transition-colors">
                  {generating ? 'Claude analyse votre document...' : 'Générer les flashcards avec Claude →'}
                </button>
              </div>
            ) : (
              <AiCardsReview
                aiCards={aiCards}
                loading={loading}
                onUpdate={updateAiCard}
                onRemove={removeAiCard}
                onReset={() => { setAiCards([]); setPdfName('') }}
                onSave={() => saveCards(aiCards)}
              />
            )}
          </div>
        )}

        {/* Wikipedia mode */}
        {mode === 'wikipedia' && (
          <div>
            {/* Step: search */}
            {wikiStep === 'search' && (
              <div>
                <div className="relative mb-4">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg select-none">🔍</span>
                  <input
                    value={wikiQuery}
                    onChange={e => setWikiQuery(e.target.value)}
                    placeholder="Rechercher un article Wikipedia..."
                    className="w-full bg-[#1E293B] border border-[#334155] rounded-xl pl-11 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#818CF8] transition-colors"
                    autoFocus
                  />
                  {wikiSearchLoading && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs animate-pulse">Recherche...</span>
                  )}
                </div>

                {wikiError && <p className="text-red-400 text-sm mb-4">{wikiError}</p>}

                {wikiArticleLoading && (
                  <div className="text-center py-12">
                    <div className="text-3xl mb-3 animate-pulse">🌐</div>
                    <p className="text-gray-400">Chargement de l'article...</p>
                  </div>
                )}

                {!wikiArticleLoading && wikiResults.length > 0 && (
                  <div className="space-y-2">
                    {wikiResults.map(([title, desc]) => (
                      <button
                        key={title}
                        onClick={() => fetchWikiArticle(title)}
                        className="w-full text-left bg-[#1E293B] hover:bg-[#1E293B]/70 border border-[#334155] hover:border-[#818CF8]/40 rounded-xl px-4 py-3 transition-colors group"
                      >
                        <div className="flex items-start gap-3">
                          <span className="shrink-0 w-6 h-6 mt-0.5 flex items-center justify-center rounded bg-black text-white text-xs font-bold font-serif">W</span>
                          <div className="min-w-0">
                            <p className="text-white font-medium text-sm group-hover:text-[#818CF8] transition-colors truncate">{title}</p>
                            {desc && <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{desc}</p>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!wikiArticleLoading && wikiQuery.length >= 2 && !wikiSearchLoading && wikiResults.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-8">Aucun résultat pour « {wikiQuery} »</p>
                )}

                {wikiQuery.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">🌐</div>
                    <p className="text-gray-500 text-sm">Recherchez n'importe quel sujet sur Wikipedia<br />pour générer des flashcards automatiquement.</p>
                  </div>
                )}
              </div>
            )}

            {/* Step: article preview */}
            {wikiStep === 'article' && (
              <div className="flex flex-col" style={{ height: 'calc(100vh - 210px)' }}>
                <div className="flex items-center gap-3 mb-4 shrink-0">
                  <button onClick={() => setWikiStep('search')} className="text-gray-400 hover:text-white transition-colors text-sm shrink-0">← Retour</button>
                  <h2 className="text-base font-bold truncate flex-1">{wikiTitle}</h2>
                </div>

                <div className="flex-1 overflow-y-auto bg-[#1E293B] rounded-2xl border border-[#334155] p-6 mb-3">
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{wikiSummary}</p>
                </div>

                <a
                  href={`https://fr.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-[#818CF8] hover:text-white text-xs mb-3 transition-colors"
                >
                  Voir l'article complet sur Wikipedia →
                </a>

                <button
                  onClick={() => setWikiStep('params')}
                  className="shrink-0 w-full bg-[#4338CA] hover:bg-[#3730A3] rounded-xl py-3 font-medium transition-colors"
                >
                  Générer des flashcards depuis cet article →
                </button>
              </div>
            )}

            {/* Step: parameters */}
            {wikiStep === 'params' && (
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <button onClick={() => setWikiStep('article')} className="text-gray-400 hover:text-white transition-colors text-sm shrink-0">← Retour</button>
                  <h2 className="text-base font-bold">Paramètres de génération</h2>
                </div>

                <div className="bg-[#1E293B] rounded-2xl border border-[#334155] p-5">
                  <label className="text-gray-400 text-sm mb-2 block">Nom du deck</label>
                  <input
                    value={wikiDeckName}
                    onChange={e => setWikiDeckName(e.target.value)}
                    placeholder="Nom du deck..."
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#818CF8] transition-colors"
                  />
                </div>

                <div className="bg-[#1E293B] rounded-2xl border border-[#334155] p-5">
                  <label className="text-gray-400 text-sm mb-4 block">
                    Nombre maximum de cartes : <span className="text-white font-bold">{wikiMaxCards}</span>
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    value={wikiMaxCards}
                    onChange={e => setWikiMaxCards(Number(e.target.value))}
                    className="w-full accent-[#4338CA]"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>5</span>
                    <span>50</span>
                  </div>
                </div>

                <div className="bg-[#1E293B] rounded-2xl border border-[#334155] p-5">
                  <label className="text-gray-400 text-sm mb-3 block">
                    Priorités <span className="text-gray-600">(optionnel)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {WIKI_PRIORITIES.map(p => (
                      <button
                        key={p}
                        onClick={() => toggleWikiPriority(p)}
                        className={`text-left px-3 py-2 rounded-xl text-sm border transition-colors ${
                          wikiPriorities.has(p)
                            ? 'bg-[#4338CA]/30 border-[#4338CA] text-[#818CF8]'
                            : 'border-[#334155] text-gray-400 hover:border-[#818CF8]/40 hover:text-white'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {wikiError && <p className="text-red-400 text-sm">{wikiError}</p>}

                <button
                  onClick={generateFromWiki}
                  disabled={generating || !wikiDeckName.trim()}
                  className="w-full bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 rounded-xl py-3 font-medium transition-colors"
                >
                  {generating ? 'Claude génère vos flashcards...' : 'Générer avec Claude →'}
                </button>
              </div>
            )}

            {/* Step: cards review & import */}
            {wikiStep === 'cards' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setWikiStep('params')} className="text-gray-400 hover:text-white transition-colors text-sm">← Retour</button>
                  <p className="text-gray-400 text-sm">{aiCards.length} cartes générées</p>
                  <button onClick={() => { setAiCards([]); setWikiStep('search') }} className="text-gray-500 hover:text-white text-sm transition-colors">Recommencer</button>
                </div>

                <div className="space-y-4 mb-6">
                  {aiCards.map((card, idx) => (
                    <div key={idx} className="bg-[#1E293B] rounded-2xl p-6 border border-[#334155]">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {card.theme && <span className="text-xs px-2 py-1 bg-[#312E81]/30 text-[#818CF8] rounded-full">{card.theme}</span>}
                          <span className="text-xs text-gray-500">Difficulté {card.difficulty}/5</span>
                        </div>
                        <button onClick={() => removeAiCard(idx)} className="text-red-400 hover:text-red-300 text-sm transition-colors">Supprimer</button>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-gray-500 text-xs mb-1 block">Question</label>
                          <textarea value={card.q || ''} onChange={e => updateAiCard(idx, 'q', e.target.value)} rows={2}
                            className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-[#818CF8] transition-colors resize-none" />
                        </div>
                        <div>
                          <label className="text-gray-500 text-xs mb-1 block">Réponse</label>
                          <textarea value={card.a || ''} onChange={e => updateAiCard(idx, 'a', e.target.value)} rows={2}
                            className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2 text-[#818CF8] text-sm focus:outline-none focus:border-[#818CF8] transition-colors resize-none" />
                        </div>
                        <div>
                          <label className="text-gray-500 text-xs mb-1 block">Explication (optionnel)</label>
                          <textarea value={card.expl || ''} onChange={e => updateAiCard(idx, 'expl', e.target.value)} rows={1}
                            className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2 text-gray-500 text-sm focus:outline-none focus:border-[#818CF8] transition-colors resize-none" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={saveWikiCards}
                  disabled={aiCards.length === 0 || loading}
                  className="w-full bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 font-medium transition-colors"
                >
                  {loading
                    ? '⏳ Import en cours...'
                    : `Importer ${aiCards.length} carte${aiCards.length > 1 ? 's' : ''} et créer le deck « ${wikiDeckName} »`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AiCardsReview({
  aiCards, loading, onUpdate, onRemove, onReset, onSave,
}: {
  aiCards: any[]
  loading: boolean
  onUpdate: (idx: number, field: string, value: string) => void
  onRemove: (idx: number) => void
  onReset: () => void
  onSave: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-400 text-sm">{aiCards.length} cartes générées — modifiez avant d'importer</p>
        <button onClick={onReset} className="text-gray-500 hover:text-white text-sm transition-colors">Recommencer</button>
      </div>
      <div className="space-y-4 mb-6">
        {aiCards.map((card, idx) => (
          <div key={idx} className="bg-[#1E293B] rounded-2xl p-6 border border-[#334155]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {card.theme && <span className="text-xs px-2 py-1 bg-[#312E81]/30 text-[#818CF8] rounded-full">{card.theme}</span>}
                <span className="text-xs text-gray-500">Difficulté {card.difficulty}/5</span>
              </div>
              <button onClick={() => onRemove(idx)} className="text-red-400 hover:text-red-300 text-sm transition-colors">Supprimer</button>
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-gray-500 text-xs mb-1 block">Question</label>
                <textarea value={card.q || ''} onChange={e => onUpdate(idx, 'q', e.target.value)} rows={2}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-[#818CF8] transition-colors resize-none" />
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1 block">Réponse</label>
                <textarea value={card.a || ''} onChange={e => onUpdate(idx, 'a', e.target.value)} rows={2}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2 text-[#818CF8] text-sm focus:outline-none focus:border-[#818CF8] transition-colors resize-none" />
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1 block">Explication (optionnel)</label>
                <textarea value={card.expl || ''} onChange={e => onUpdate(idx, 'expl', e.target.value)} rows={1}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2 text-gray-500 text-sm focus:outline-none focus:border-[#818CF8] transition-colors resize-none" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onSave}
        disabled={aiCards.length === 0 || loading}
        className="w-full bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 font-medium transition-colors"
      >
        {loading ? '⏳ Import en cours...' : `Importer ${aiCards.length} cartes →`}
      </button>
    </div>
  )
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0F172A]" />}>
      <CreatePageInner />
    </Suspense>
  )
}

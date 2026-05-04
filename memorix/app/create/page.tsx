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
  const themeIdParam = searchParams.get('themeId')
  const supabase = createClient()

  const [mode, setMode] = useState<'manual' | 'ai' | 'wikipedia'>('manual')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [pdfName, setPdfName] = useState('')
  const [selectedThemeId, setSelectedThemeId] = useState(themeIdParam || '')
  const [themes, setThemes] = useState<Array<{ id: string; name: string; color: string; parent_id?: string | null }>>([])
  const [userId, setUserId] = useState('')
  const [showCreateTheme, setShowCreateTheme] = useState(false)
  const [newThemeName, setNewThemeName] = useState('')
  const [creatingTheme, setCreatingTheme] = useState(false)
  const [createThemeError, setCreateThemeError] = useState('')
  const [saveError, setSaveError] = useState('')
  // kept for deckName display in header
  const [deckName] = useState('')

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
    async function loadThemes() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase.from('themes').select('id, name, color, parent_id').eq('user_id', user.id).order('name')
      setThemes(data || [])
      if (!themeIdParam && data && data.length > 0) setSelectedThemeId(data[0].id)
    }
    loadThemes()
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
    if (!selectedThemeId) {
      setSaveError('Sélectionnez ou créez un thème avant d\'importer.')
      return
    }
    setSaveError('')
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaveError('Session expirée — rechargez la page.')
      setLoading(false)
      return
    }

    const { data: insertedCards, error } = await supabase.from('cards').insert(
      aiCards.map(c => ({
        theme_id: selectedThemeId,
        question: c.q,
        answer: c.a,
        explanation: c.expl || null,
        theme: c.theme || null,
        difficulty: c.difficulty || 3,
        created_by_ai: true,
        user_edited: false,
      }))
    ).select('id')

    if (error) {
      console.error('saveWikiCards error:', error)
      setSaveError(error.message || 'Erreur lors de l\'import')
      setLoading(false)
      return
    }

    if (insertedCards && insertedCards.length > 0) {
      await supabase.from('card_reviews').insert(
        insertedCards.map((card: { id: string }) => ({
          card_id: card.id,
          user_id: user.id,
          state: 'new',
          scheduled_at: new Date().toISOString(),
        }))
      )
      router.push(`/themes/${selectedThemeId}`)
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
    if (!selectedThemeId) {
      setSaveError('Sélectionnez ou créez un thème avant de sauvegarder.')
      return
    }
    setSaveError('')
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaveError('Session expirée — rechargez la page.')
      setLoading(false)
      return
    }

    const { data: insertedCards, error } = await supabase.from('cards').insert(
      cardsToSave.map(c => ({
        theme_id: selectedThemeId,
        question: c.question || c.q,
        answer: c.answer || c.a,
        explanation: c.explanation || c.expl || null,
        theme: c.theme || null,
        difficulty: c.difficulty || 3,
        created_by_ai: mode === 'ai',
        user_edited: false,
      }))
    ).select('id')

    if (error) {
      console.error('saveCards error:', error)
      setSaveError(error.message || 'Erreur lors de la sauvegarde')
      setLoading(false)
      return
    }

    if (insertedCards && insertedCards.length > 0) {
      await supabase.from('card_reviews').insert(
        insertedCards.map((card: { id: string }) => ({
          card_id: card.id,
          user_id: user.id,
          state: 'new',
          scheduled_at: new Date().toISOString(),
        }))
      )
      router.push(`/themes/${selectedThemeId}`)
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
  }

  function buildFlatThemes(list: typeof themes) {
    type FlatTheme = { id: string; name: string; color: string; depth: number }
    const result: FlatTheme[] = []
    function add(t: typeof list[0], depth: number) {
      result.push({ id: t.id, name: t.name, color: t.color, depth })
      list.filter(c => c.parent_id === t.id).forEach(c => add(c, depth + 1))
    }
    list.filter(t => !t.parent_id).forEach(r => add(r, 0))
    return result
  }

  async function createTheme() {
    if (!newThemeName.trim() || creatingTheme) return
    if (!userId) {
      setCreateThemeError('Session expirée — rechargez la page.')
      return
    }
    setCreateThemeError('')
    setCreatingTheme(true)
    const { data, error } = await supabase.from('themes').insert({
      user_id: userId,
      name: newThemeName.trim(),
      color: '#4338CA',
      position: 0,
    }).select().single()
    if (error) {
      console.error('createTheme error:', error)
      setCreateThemeError(error.message || 'Erreur lors de la création du thème')
      setCreatingTheme(false)
      return
    }
    if (data) {
      setThemes(prev => [...prev, data as typeof themes[0]])
      setSelectedThemeId((data as { id: string }).id)
      setShowCreateTheme(false)
      setNewThemeName('')
    }
    setCreatingTheme(false)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => router.push('/dashboard')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">← Retour</button>
          <h1 className="text-lg font-bold">{deckName || 'Ajouter des cartes'}</h1>
          <div className="w-16" />
        </div>

        {/* Theme selector */}
        <div className="mb-6">
          {themes.length > 0 && (
            <select
              value={selectedThemeId}
              onChange={e => setSelectedThemeId(e.target.value)}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
            >
              {buildFlatThemes(themes).map(t => (
                <option key={t.id} value={t.id}>
                  {' '.repeat(t.depth * 3)}{t.depth > 0 ? '└ ' : ''}{t.name}
                </option>
              ))}
            </select>
          )}

          {!showCreateTheme ? (
            <button
              onClick={() => setShowCreateTheme(true)}
              className="mt-2 text-sm text-[var(--accent-light)] hover:text-[var(--text-primary)] transition-colors"
            >
              + Créer un nouveau thème
            </button>
          ) : (
            <div className="mt-2">
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newThemeName}
                  onChange={e => { setNewThemeName(e.target.value); setCreateThemeError('') }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') createTheme()
                    if (e.key === 'Escape') { setShowCreateTheme(false); setNewThemeName(''); setCreateThemeError('') }
                  }}
                  placeholder="Nom du thème..."
                  className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                />
                <button
                  onClick={createTheme}
                  disabled={!newThemeName.trim() || creatingTheme}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 rounded-xl px-4 py-2 text-sm font-medium transition-colors"
                >
                  {creatingTheme ? '…' : 'Créer'}
                </button>
                <button
                  onClick={() => { setShowCreateTheme(false); setNewThemeName(''); setCreateThemeError('') }}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm transition-colors"
                >
                  ✕
                </button>
              </div>
              {createThemeError && (
                <p className="text-red-400 text-xs mt-1.5">⚠ {createThemeError}</p>
              )}
            </div>
          )}
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-8 bg-[var(--bg-surface)] p-1 rounded-xl">
          <button onClick={() => setMode('manual')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            Saisie manuelle
          </button>
          <button onClick={() => setMode('ai')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'ai' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            Générer avec Claude
          </button>
          <button onClick={enterWikiMode}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'wikipedia' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            Wikipedia
          </button>
        </div>

        {/* Manual mode */}
        {mode === 'manual' && (
          <div>
            <div className="space-y-4 mb-6">
              {cards.map((card, idx) => (
                <div key={idx} className="bg-[var(--bg-surface)] rounded-2xl p-6 border border-[var(--border-default)]">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[var(--text-muted)] text-sm font-medium">Carte {idx + 1}</span>
                    {cards.length > 1 && (
                      <button onClick={() => removeCard(idx)} className="text-red-400 hover:text-red-300 text-sm transition-colors">Supprimer</button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <input value={card.question} onChange={e => updateCard(idx, 'question', e.target.value)}
                      placeholder="Question..." className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors" />
                    <input value={card.answer} onChange={e => updateCard(idx, 'answer', e.target.value)}
                      placeholder="Réponse..." className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors" />
                    <input value={card.explanation} onChange={e => updateCard(idx, 'explanation', e.target.value)}
                      placeholder="Explication (optionnel)..." className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors" />
                  </div>
                </div>
              ))}
            </div>
            {saveError && (
              <p className="text-red-400 text-sm mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">⚠ {saveError}</p>
            )}
            <div className="flex gap-4">
              <button onClick={addCard} className="flex-1 border border-[var(--border-default)] hover:border-[var(--accent)] rounded-xl py-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                + Ajouter une carte
              </button>
              <button onClick={() => saveCards(cards)} disabled={!cards.some(c => c.question && c.answer) || loading}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 font-medium transition-colors">
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
                  <label className="text-[var(--text-muted)] text-sm mb-2 block">Option 1 — Uploadez un PDF</label>
                  <label
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                      dragOver ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/20' : 'border-[var(--border-default)] hover:border-[var(--border-focus)]/50'
                    }`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                  >
                    <input type="file" accept=".pdf" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
                    {extracting ? (
                      <div className="text-center">
                        <div className="text-2xl mb-2">⏳</div>
                        <p className="text-[var(--text-muted)] text-sm">Extraction du texte en cours...</p>
                      </div>
                    ) : pdfName ? (
                      <div className="text-center">
                        <div className="text-2xl mb-2">{generating ? '🧠' : '📄'}</div>
                        <p className="text-[var(--text-primary)] text-sm font-medium">{pdfName}</p>
                        <p className="text-[var(--text-muted)] text-xs mt-1">
                          {generating ? 'Claude génère les cartes...' : `Texte extrait (${aiText.length} caractères)`}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-2xl mb-2">📎</div>
                        <p className="text-[var(--text-muted)] text-sm">Glissez un PDF ici ou cliquez pour choisir</p>
                      </div>
                    )}
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[var(--accent-subtle)]/30" />
                  <span className="text-[var(--text-muted)] text-xs">ou</span>
                  <div className="flex-1 h-px bg-[var(--accent-subtle)]/30" />
                </div>

                <div>
                  <label className="text-[var(--text-muted)] text-sm mb-2 block">Option 2 — Collez votre texte</label>
                  <textarea value={aiText} onChange={e => { setAiText(e.target.value); setPdfName('') }}
                    placeholder="Collez ici votre texte, vos notes, un résumé, un term-sheet..." rows={8}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none" />
                  <p className="text-[var(--text-muted)] text-xs mt-1">{aiText.length} caractères</p>
                </div>

                {aiError && <p className="text-red-400 text-sm">{aiError}</p>}
                <button onClick={generateCards} disabled={generating || aiText.length < 50}
                  className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 rounded-xl py-3 font-medium transition-colors">
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
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-lg select-none">🔍</span>
                  <input
                    value={wikiQuery}
                    onChange={e => setWikiQuery(e.target.value)}
                    placeholder="Rechercher un article Wikipedia..."
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl pl-11 pr-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                    autoFocus
                  />
                  {wikiSearchLoading && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs animate-pulse">Recherche...</span>
                  )}
                </div>

                {wikiError && <p className="text-red-400 text-sm mb-4">{wikiError}</p>}

                {wikiArticleLoading && (
                  <div className="text-center py-12">
                    <div className="text-3xl mb-3 animate-pulse">🌐</div>
                    <p className="text-[var(--text-muted)]">Chargement de l'article...</p>
                  </div>
                )}

                {!wikiArticleLoading && wikiResults.length > 0 && (
                  <div className="space-y-2">
                    {wikiResults.map(([title, desc]) => (
                      <button
                        key={title}
                        onClick={() => fetchWikiArticle(title)}
                        className="w-full text-left bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)]/70 border border-[var(--border-default)] hover:border-[var(--border-focus)]/40 rounded-xl px-4 py-3 transition-colors group"
                      >
                        <div className="flex items-start gap-3">
                          <span className="shrink-0 w-6 h-6 mt-0.5 flex items-center justify-center rounded bg-black text-white text-xs font-bold font-serif">W</span>
                          <div className="min-w-0">
                            <p className="text-[var(--text-primary)] font-medium text-sm group-hover:text-[var(--accent-light)] transition-colors truncate">{title}</p>
                            {desc && <p className="text-[var(--text-muted)] text-xs mt-0.5 line-clamp-2">{desc}</p>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!wikiArticleLoading && wikiQuery.length >= 2 && !wikiSearchLoading && wikiResults.length === 0 && (
                  <p className="text-[var(--text-muted)] text-sm text-center py-8">Aucun résultat pour « {wikiQuery} »</p>
                )}

                {wikiQuery.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">🌐</div>
                    <p className="text-[var(--text-muted)] text-sm">Recherchez n'importe quel sujet sur Wikipedia<br />pour générer des flashcards automatiquement.</p>
                  </div>
                )}
              </div>
            )}

            {/* Step: article preview */}
            {wikiStep === 'article' && (
              <div className="flex flex-col" style={{ height: 'calc(100vh - 210px)' }}>
                <div className="flex items-center gap-3 mb-4 shrink-0">
                  <button onClick={() => setWikiStep('search')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-sm shrink-0">← Retour</button>
                  <h2 className="text-base font-bold truncate flex-1">{wikiTitle}</h2>
                </div>

                <div className="flex-1 overflow-y-auto bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] p-6 mb-3">
                  <p className="text-[var(--text-secondary)] text-sm leading-relaxed whitespace-pre-wrap">{wikiSummary}</p>
                </div>

                <a
                  href={`https://fr.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-[var(--accent-light)] hover:text-[var(--text-primary)] text-xs mb-3 transition-colors"
                >
                  Voir l'article complet sur Wikipedia →
                </a>

                <button
                  onClick={() => setWikiStep('params')}
                  className="shrink-0 w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl py-3 font-medium transition-colors"
                >
                  Générer des flashcards depuis cet article →
                </button>
              </div>
            )}

            {/* Step: parameters */}
            {wikiStep === 'params' && (
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <button onClick={() => setWikiStep('article')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-sm shrink-0">← Retour</button>
                  <h2 className="text-base font-bold">Paramètres de génération</h2>
                </div>

                <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] p-5">
                  <label className="text-[var(--text-muted)] text-sm mb-4 block">
                    Nombre maximum de cartes : <span className="text-[var(--text-primary)] font-bold">{wikiMaxCards}</span>
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    value={wikiMaxCards}
                    onChange={e => setWikiMaxCards(Number(e.target.value))}
                    className="w-full accent-[#4338CA]"
                  />
                  <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                    <span>5</span>
                    <span>50</span>
                  </div>
                </div>

                <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] p-5">
                  <label className="text-[var(--text-muted)] text-sm mb-3 block">
                    Priorités <span className="text-[var(--text-muted)]">(optionnel)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {WIKI_PRIORITIES.map(p => (
                      <button
                        key={p}
                        onClick={() => toggleWikiPriority(p)}
                        className={`text-left px-3 py-2 rounded-xl text-sm border transition-colors ${
                          wikiPriorities.has(p)
                            ? 'bg-[var(--accent)]/30 border-[var(--accent)] text-[var(--accent-light)]'
                            : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-focus)]/40 hover:text-[var(--text-primary)]'
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
                  disabled={generating}
                  className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 rounded-xl py-3 font-medium transition-colors"
                >
                  {generating ? 'Claude génère vos flashcards...' : 'Générer avec Claude →'}
                </button>
              </div>
            )}

            {/* Step: cards review & import */}
            {wikiStep === 'cards' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setWikiStep('params')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-sm">← Retour</button>
                  <p className="text-[var(--text-muted)] text-sm">{aiCards.length} cartes générées</p>
                  <button onClick={() => { setAiCards([]); setWikiStep('search') }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors">Recommencer</button>
                </div>

                <div className="space-y-4 mb-6">
                  {aiCards.map((card, idx) => (
                    <div key={idx} className="bg-[var(--bg-surface)] rounded-2xl p-6 border border-[var(--border-default)]">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {card.theme && <span className="text-xs px-2 py-1 bg-[var(--accent-subtle)]/30 text-[var(--accent-light)] rounded-full">{card.theme}</span>}
                          <span className="text-xs text-[var(--text-muted)]">Difficulté {card.difficulty}/5</span>
                        </div>
                        <button onClick={() => removeAiCard(idx)} className="text-red-400 hover:text-red-300 text-sm transition-colors">Supprimer</button>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[var(--text-muted)] text-xs mb-1 block">Question</label>
                          <textarea value={card.q || ''} onChange={e => updateAiCard(idx, 'q', e.target.value)} rows={2}
                            className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none" />
                        </div>
                        <div>
                          <label className="text-[var(--text-muted)] text-xs mb-1 block">Réponse</label>
                          <textarea value={card.a || ''} onChange={e => updateAiCard(idx, 'a', e.target.value)} rows={2}
                            className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-2 text-[var(--accent-light)] text-sm focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none" />
                        </div>
                        <div>
                          <label className="text-[var(--text-muted)] text-xs mb-1 block">Explication (optionnel)</label>
                          <textarea value={card.expl || ''} onChange={e => updateAiCard(idx, 'expl', e.target.value)} rows={1}
                            className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-2 text-[var(--text-muted)] text-sm focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {saveError && (
                  <p className="text-red-400 text-sm mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">⚠ {saveError}</p>
                )}
                <button
                  onClick={saveWikiCards}
                  disabled={aiCards.length === 0 || loading}
                  className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 font-medium transition-colors"
                >
                  {loading
                    ? '⏳ Import en cours...'
                    : `Importer ${aiCards.length} carte${aiCards.length > 1 ? 's' : ''} dans le thème sélectionné`}
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
        <p className="text-[var(--text-muted)] text-sm">{aiCards.length} cartes générées — modifiez avant d'importer</p>
        <button onClick={onReset} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors">Recommencer</button>
      </div>
      <div className="space-y-4 mb-6">
        {aiCards.map((card, idx) => (
          <div key={idx} className="bg-[var(--bg-surface)] rounded-2xl p-6 border border-[var(--border-default)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {card.theme && <span className="text-xs px-2 py-1 bg-[var(--accent-subtle)]/30 text-[var(--accent-light)] rounded-full">{card.theme}</span>}
                <span className="text-xs text-[var(--text-muted)]">Difficulté {card.difficulty}/5</span>
              </div>
              <button onClick={() => onRemove(idx)} className="text-red-400 hover:text-red-300 text-sm transition-colors">Supprimer</button>
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-[var(--text-muted)] text-xs mb-1 block">Question</label>
                <textarea value={card.q || ''} onChange={e => onUpdate(idx, 'q', e.target.value)} rows={2}
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none" />
              </div>
              <div>
                <label className="text-[var(--text-muted)] text-xs mb-1 block">Réponse</label>
                <textarea value={card.a || ''} onChange={e => onUpdate(idx, 'a', e.target.value)} rows={2}
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-2 text-[var(--accent-light)] text-sm focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none" />
              </div>
              <div>
                <label className="text-[var(--text-muted)] text-xs mb-1 block">Explication (optionnel)</label>
                <textarea value={card.expl || ''} onChange={e => onUpdate(idx, 'expl', e.target.value)} rows={1}
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-2 text-[var(--text-muted)] text-sm focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onSave}
        disabled={aiCards.length === 0 || loading}
        className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 font-medium transition-colors"
      >
        {loading ? '⏳ Import en cours...' : `Importer ${aiCards.length} cartes →`}
      </button>
    </div>
  )
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg-base)]" />}>
      <CreatePageInner />
    </Suspense>
  )
}

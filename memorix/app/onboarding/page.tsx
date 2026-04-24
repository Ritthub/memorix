'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function saveName() {
    if (!name.trim()) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ name: name.trim() }).eq('id', user.id)
    }
    setLoading(false)
    setStep(2)
  }

  async function finish(choice: 'create' | 'import') {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ onboarded: true }).eq('id', user.id)
    }
    setLoading(false)
    if (choice === 'create') router.push('/create')
    else router.push('/create?mode=ai')
  }

  return (
    <div className="min-h-screen bg-[#0D0D1A] text-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-[#534AB7] mb-1">Memorix</h1>
          <p className="text-gray-500 text-sm">Votre mémoire, augmentée</p>
        </div>

        {/* Indicateur d'étapes */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[1, 2, 3].map(s => (
            <div key={s} className={`rounded-full transition-all duration-300 ${
              s === step ? 'w-6 h-2 bg-[#534AB7]' : s < step ? 'w-2 h-2 bg-[#534AB7]/60' : 'w-2 h-2 bg-[#534AB7]/20'
            }`} />
          ))}
        </div>

        {/* Étape 1 — Prénom */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-2xl font-bold mb-2">Comment vous appelez-vous ?</h2>
            <p className="text-gray-400 mb-8">Pour personnaliser votre expérience d'apprentissage.</p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && name.trim() && saveName()}
              placeholder="Votre prénom"
              autoFocus
              className="w-full bg-[#1A1A2E] border border-[#534AB7]/30 rounded-xl px-4 py-4 text-white text-lg placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors mb-4"
            />
            <button
              onClick={saveName}
              disabled={!name.trim() || loading}
              className="w-full bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-40 rounded-xl py-4 font-medium text-lg transition-colors"
            >
              {loading ? 'Enregistrement...' : 'Continuer →'}
            </button>
          </div>
        )}

        {/* Étape 2 — Objectif */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-2xl font-bold mb-2">Pour quel usage principal ?</h2>
            <p className="text-gray-400 mb-8">Cela nous aide à calibrer vos recommandations.</p>
            <div className="space-y-3 mb-6">
              {[
                { icon: '💼', label: 'Professionnel', sub: 'Documents, contrats, formations' },
                { icon: '🎓', label: 'Études', sub: 'Révisions, examens, cours' },
                { icon: '🌍', label: 'Langues', sub: 'Vocabulaire, grammaire' },
                { icon: '🧠', label: 'Culture générale', sub: 'Livres, podcasts, curiosité' },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => setStep(3)}
                  className="w-full flex items-center gap-4 bg-[#1A1A2E] hover:bg-[#534AB7]/10 border border-[#534AB7]/20 hover:border-[#534AB7]/60 rounded-xl px-4 py-4 text-left transition-colors"
                >
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <div className="font-medium">{item.label}</div>
                    <div className="text-gray-400 text-sm">{item.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Étape 3 — Premier deck */}
        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-2xl font-bold mb-2">Créons votre premier deck</h2>
            <p className="text-gray-400 mb-8">Choisissez comment ajouter vos premières cartes.</p>
            <div className="space-y-3">
              <button
                onClick={() => finish('import')}
                disabled={loading}
                className="w-full flex items-center gap-4 bg-[#534AB7] hover:bg-[#3C3489] rounded-xl px-4 py-5 text-left transition-colors"
              >
                <span className="text-2xl">🤖</span>
                <div>
                  <div className="font-medium text-lg">Générer avec Claude</div>
                  <div className="text-[#AFA9EC] text-sm">Uploadez un PDF ou collez du texte</div>
                </div>
              </button>
              <button
                onClick={() => finish('create')}
                disabled={loading}
                className="w-full flex items-center gap-4 bg-[#1A1A2E] hover:bg-[#534AB7]/10 border border-[#534AB7]/20 hover:border-[#534AB7]/60 rounded-xl px-4 py-5 text-left transition-colors"
              >
                <span className="text-2xl">✏️</span>
                <div>
                  <div className="font-medium text-lg">Créer manuellement</div>
                  <div className="text-gray-400 text-sm">Saisir vos propres questions/réponses</div>
                </div>
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full text-center text-gray-500 hover:text-gray-300 text-sm py-3 transition-colors"
              >
                Passer pour l'instant
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
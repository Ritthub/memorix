'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getAuthCallbackUrl } from './actions'

type Mode = 'login' | 'signup' | 'forgot'

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const linkExpired = searchParams.get('message') === 'link_expired'
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>(linkExpired ? 'forgot' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function switchMode(m: Mode) {
    setMode(m)
    setError(null)
    setInfo(null)
    setPassword('')
    setConfirm('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (mode === 'forgot') {
      setLoading(true)
      const callbackUrl = await getAuthCallbackUrl()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${callbackUrl}?type=recovery`,
      })
      setLoading(false)
      if (error) { setError(error.message); return }
      setInfo('Un email de réinitialisation t\'a été envoyé. Clique sur le lien pour choisir un nouveau mot de passe.')
      return
    }

    if (mode === 'signup') {
      if (password.length < 8) {
        setError('Le mot de passe doit faire au moins 8 caractères.')
        return
      }
      if (password !== confirm) {
        setError('Les mots de passe ne correspondent pas.')
        return
      }
      setLoading(true)
      const callbackUrl = await getAuthCallbackUrl()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl },
      })
      setLoading(false)
      if (error) {
        setError(error.message === 'User already registered'
          ? 'Un compte existe déjà avec cet email.'
          : error.message)
        return
      }
      if (data.session) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setInfo('Un email de confirmation t\'a été envoyé. Clique sur le lien pour activer ton compte.')
      }
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      const msg = error.message?.toLowerCase() || ''
      if (msg.includes('email not confirmed')) {
        setError('Ton email n\'est pas encore confirmé. Clique sur le lien reçu lors de l\'inscription, ou utilise "Mot de passe oublié" pour renvoyer un email.')
      } else {
        setError('Email ou mot de passe incorrect.')
      }
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-semibold text-[var(--accent-light)] mb-2">Memorix</h1>
          <p className="text-[var(--text-muted)]">Apprenez mieux, retenez plus longtemps</p>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-8">
          {mode !== 'forgot' && (
            <div className="flex bg-[var(--bg-base)] rounded-xl p-1 mb-6">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'login' ? 'bg-[var(--accent)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'signup' ? 'bg-[var(--accent)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Créer un compte
              </button>
            </div>
          )}

          {mode === 'forgot' && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7l-7 7 7 7" />
                </svg>
                Retour à la connexion
              </button>
              {linkExpired && (
                <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-300 text-sm">
                  Votre lien a expiré. Demandez-en un nouveau ci-dessous.
                </div>
              )}
              <h2 className="text-lg font-bold mt-4 mb-1">Mot de passe oublié</h2>
              <p className="text-[var(--text-muted)] text-sm">
                Saisis ton email et on t'envoie un lien pour choisir un nouveau mot de passe.
              </p>
            </div>
          )}

          {info ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 text-center">
              <div className="text-3xl mb-3">📬</div>
              <p className="text-green-400 text-sm">{info}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[#94A3B8] text-sm mb-1.5 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  required
                  autoComplete="email"
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label className="text-[#94A3B8] text-sm mb-1.5 block">Mot de passe</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Au moins 8 caractères' : '••••••••'}
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                  />
                </div>
              )}

              {mode === 'signup' && (
                <div>
                  <label className="text-[#94A3B8] text-sm mb-1.5 block">Confirmer le mot de passe</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                  />
                </div>
              )}

              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--text-primary)] rounded-xl py-3 font-medium transition-colors"
              >
                {loading ? '…' : mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer le compte' : 'Envoyer le lien'}
              </button>

              {mode === 'login' && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-light)] transition-colors"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg-base)]" />}>
      <LoginInner />
    </Suspense>
  )
}

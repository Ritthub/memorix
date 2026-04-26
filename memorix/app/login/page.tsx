'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('login')
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      setLoading(false)
      if (error) {
        setError(error.message === 'User already registered'
          ? 'Un compte existe déjà avec cet email.'
          : error.message)
        return
      }
      if (data.session) {
        // Email confirmation disabled — logged in immediately
        router.push('/')
        router.refresh()
      } else {
        setInfo('Un email de confirmation t\'a été envoyé. Clique sur le lien pour activer ton compte.')
      }
    } else {
      setLoading(true)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) {
        setError('Email ou mot de passe incorrect.')
        return
      }
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0D1A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-[#534AB7] mb-2">Memorix</h1>
          <p className="text-gray-400">Apprenez mieux, retenez plus longtemps</p>
        </div>

        <div className="bg-[#1A1A2E] border border-[#534AB7]/30 rounded-2xl p-8">
          {/* Tabs */}
          <div className="flex bg-[#0D0D1A] rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'login' ? 'bg-[#534AB7] text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-[#534AB7] text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Créer un compte
            </button>
          </div>

          {info ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 text-center">
              <div className="text-3xl mb-3">📬</div>
              <p className="text-green-400 text-sm">{info}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  required
                  autoComplete="email"
                  className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Au moins 8 caractères' : '••••••••'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors"
                />
              </div>
              {mode === 'signup' && (
                <div>
                  <label className="text-gray-400 text-sm mb-1.5 block">Confirmer le mot de passe</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors"
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
                className="w-full bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-40 text-white rounded-xl py-3 font-medium transition-colors"
              >
                {loading ? '…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
              </button>

              {mode === 'login' && (
                <div className="text-center">
                  <Link
                    href="/reset-password"
                    className="text-xs text-gray-500 hover:text-[#534AB7] transition-colors"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

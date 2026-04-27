'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login')
      } else {
        setReady(true)
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 2000)
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-gray-400">…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-8">
          <h1 className="text-xl font-bold mb-1">Nouveau mot de passe</h1>
          <p className="text-gray-400 text-sm mb-6">
            Choisis un nouveau mot de passe pour ton compte.
          </p>

          {done ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 text-center">
              <p className="text-green-400 font-medium mb-1">Mot de passe mis à jour</p>
              <p className="text-gray-400 text-sm">Tu vas être redirigé…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Nouveau mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Au moins 8 caractères"
                  required
                  autoFocus
                  autoComplete="new-password"
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#818CF8] transition-colors"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Confirmer le mot de passe</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#818CF8] transition-colors"
                />
              </div>
              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 text-white rounded-xl py-3 font-medium transition-colors"
              >
                {loading ? '…' : 'Enregistrer le mot de passe'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

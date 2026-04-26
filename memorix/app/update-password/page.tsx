'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    if (error) {
      setError(error.message)
      return
    }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#0D0D1A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#1A1A2E] border border-[#534AB7]/30 rounded-2xl p-8">
          <h1 className="text-xl font-bold mb-1">Nouveau mot de passe</h1>
          <p className="text-gray-400 text-sm mb-6">Choisis un mot de passe d'au moins 8 caractères.</p>

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
                className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors"
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
                className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors"
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
              className="w-full bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-40 text-white rounded-xl py-3 font-medium transition-colors"
            >
              {loading ? '…' : 'Enregistrer le mot de passe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

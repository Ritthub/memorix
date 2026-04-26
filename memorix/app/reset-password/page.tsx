'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?type=recovery`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-[#0D0D1A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-white text-sm mb-8 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7l-7 7 7 7" />
          </svg>
          Retour à la connexion
        </Link>

        <div className="bg-[#1A1A2E] border border-[#534AB7]/30 rounded-2xl p-8">
          <h1 className="text-xl font-bold mb-1">Mot de passe oublié</h1>
          <p className="text-gray-400 text-sm mb-6">
            Saisis ton email et on t'envoie un lien pour choisir un nouveau mot de passe.
          </p>

          {sent ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 text-center">
              <div className="text-3xl mb-3">📬</div>
              <p className="text-green-400 font-medium mb-1">Email envoyé</p>
              <p className="text-gray-400 text-sm">
                Vérifie ta boîte mail et clique sur le lien pour réinitialiser ton mot de passe.
              </p>
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
                  autoFocus
                  autoComplete="email"
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
                {loading ? '…' : 'Envoyer le lien'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

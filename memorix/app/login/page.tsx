'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleLogin() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    })
    if (!error) setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0D0D1A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-[#534AB7] mb-2">Memorix</h1>
          <p className="text-gray-400">Apprenez mieux, retenez plus longtemps</p>
        </div>

        {sent ? (
          <div className="bg-[#1A1A2E] border border-[#534AB7]/30 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">📬</div>
            <h2 className="text-white text-xl font-medium mb-2">Vérifiez vos emails</h2>
            <p className="text-gray-400">
              Un lien de connexion a été envoyé à <strong className="text-white">{email}</strong>
            </p>
          </div>
        ) : (
          <div className="bg-[#1A1A2E] border border-[#534AB7]/30 rounded-2xl p-8">
            <h2 className="text-white text-xl font-medium mb-6">Connexion</h2>
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="vous@exemple.com"
                  className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors"
                />
              </div>
              <button
                onClick={handleLogin}
                disabled={!email || loading}
                className="w-full bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-40 text-white rounded-xl py-3 font-medium transition-colors"
              >
                {loading ? 'Envoi...' : 'Recevoir le lien de connexion'}
              </button>
            </div>
            <p className="text-gray-600 text-xs text-center mt-4">
              Pas de mot de passe — connexion par lien magique
            </p>
          </div>
        )}
      </div>
    </div>
  )
}


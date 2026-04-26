'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Profile = { name: string | null; retention_target: number | null; daily_goal: number | null }

function useTheme() {
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('memorix-theme') as 'dark' | 'light' | null
    if (saved) {
      setThemeState(saved)
      document.documentElement.classList.toggle('light-mode', saved === 'light')
    }
  }, [])

  function setTheme(t: 'dark' | 'light') {
    setThemeState(t)
    localStorage.setItem('memorix-theme', t)
    document.documentElement.classList.toggle('light-mode', t === 'light')
  }

  return { theme, setTheme }
}

export default function SettingsView({ profile, email }: { profile: Profile | null; email: string }) {
  const router = useRouter()
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [name, setName] = useState(profile?.name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Change password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  async function saveProfile() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ name: name.trim() }).eq('id', user.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function savePassword() {
    setPasswordError(null)
    if (newPassword.length < 8) { setPasswordError('Au moins 8 caractères.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('Les mots de passe ne correspondent pas.'); return }
    setPasswordSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordSaving(false)
    if (error) { setPasswordError(error.message); return }
    setNewPassword('')
    setConfirmPassword('')
    setPasswordSaved(true)
    setTimeout(() => setPasswordSaved(false), 2000)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[#0D0D1A] text-white pb-24">
      <header className="border-b border-[#534AB7]/20 px-6 py-4">
        <h1 className="text-xl font-bold text-[#534AB7]">Paramètres</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Profile */}
        <section className="bg-[#1A1A2E] rounded-2xl p-6 border border-[#534AB7]/20">
          <h2 className="font-semibold mb-4 text-gray-300">Profil</h2>
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Prénom</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#534AB7] transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Email</label>
              <div className="bg-[#0D0D1A]/50 border border-[#534AB7]/10 rounded-xl px-4 py-2.5 text-gray-500 text-sm">
                {email}
              </div>
            </div>
            <button
              onClick={saveProfile}
              disabled={saving || !name.trim()}
              className="bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-40 rounded-xl px-6 py-2.5 font-medium text-sm transition-colors"
            >
              {saved ? '✓ Enregistré' : saving ? 'Sauvegarde...' : 'Enregistrer'}
            </button>
          </div>
        </section>

        {/* Appearance */}
        <section className="bg-[#1A1A2E] rounded-2xl p-6 border border-[#534AB7]/20">
          <h2 className="font-semibold mb-4 text-gray-300">Apparence</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Thème</div>
              <div className="text-xs text-gray-500 mt-0.5">Mode d'affichage de l'interface</div>
            </div>
            <div className="flex bg-[#0D0D1A] rounded-xl p-1 gap-1">
              <button
                onClick={() => setTheme('dark')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  theme === 'dark' ? 'bg-[#534AB7] text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                🌙 Sombre
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  theme === 'light' ? 'bg-[#534AB7] text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                ☀️ Clair
              </button>
            </div>
          </div>
        </section>

        {/* Change password */}
        <section className="bg-[#1A1A2E] rounded-2xl p-6 border border-[#534AB7]/20">
          <h2 className="font-semibold mb-4 text-gray-300">Mot de passe</h2>
          <div className="space-y-3">
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Nouveau mot de passe</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Au moins 8 caractères"
                autoComplete="new-password"
                className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors text-sm"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Confirmer</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#534AB7] transition-colors text-sm"
              />
            </div>
            {passwordError && (
              <p className="text-red-400 text-xs bg-red-500/10 rounded-xl px-4 py-2.5">{passwordError}</p>
            )}
            <button
              onClick={savePassword}
              disabled={passwordSaving || !newPassword}
              className="bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-40 rounded-xl px-6 py-2.5 font-medium text-sm transition-colors"
            >
              {passwordSaved ? '✓ Mot de passe mis à jour' : passwordSaving ? 'Sauvegarde…' : 'Changer le mot de passe'}
            </button>
          </div>
        </section>

        {/* Danger zone */}
        <section className="bg-[#1A1A2E] rounded-2xl p-6 border border-red-500/20">
          <h2 className="font-semibold mb-4 text-gray-300">Compte</h2>
          <button
            onClick={signOut}
            className="w-full border border-red-500/40 hover:border-red-500 hover:bg-red-500/10 text-red-400 rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            Se déconnecter
          </button>
        </section>
      </main>
    </div>
  )
}

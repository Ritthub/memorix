'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { themes, ThemeKey } from '@/lib/themes'

type Profile = { name: string | null; retention_target: number | null; daily_goal: number | null }

export default function SettingsView({ profile, email }: { profile: Profile | null; email: string }) {
  const router = useRouter()
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [name, setName] = useState(profile?.name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
    <div className="min-h-screen pb-24" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <header className="border-b px-6 py-4" style={{ borderColor: 'var(--border-default)' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--accent)' }}>Paramètres</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Profile */}
        <section className="rounded-2xl p-6 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Profil</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm block mb-1" style={{ color: 'var(--text-muted)' }}>Prénom</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 focus:outline-none transition-colors"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              />
            </div>
            <div>
              <label className="text-sm block mb-1" style={{ color: 'var(--text-muted)' }}>Email</label>
              <div className="border rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                {email}
              </div>
            </div>
            <button
              onClick={saveProfile}
              disabled={saving || !name.trim()}
              className="rounded-xl px-6 py-2.5 font-medium text-sm transition-colors disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#fff' }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseOut={e => (e.currentTarget.style.background = 'var(--accent)')}>
              {saved ? '✓ Enregistré' : saving ? 'Sauvegarde...' : 'Enregistrer'}
            </button>
          </div>
        </section>

        {/* Appearance */}
        <section className="rounded-2xl p-6 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Apparence</h2>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(themes) as ThemeKey[]).map(key => {
              const t = themes[key]
              const active = theme === key
              return (
                <button
                  key={key}
                  onClick={() => setTheme(key)}
                  className="relative rounded-xl p-4 border-2 text-left transition-all"
                  style={{
                    background: 'var(--bg-base)',
                    borderColor: active ? 'var(--accent)' : 'var(--border-default)',
                  }}
                >
                  {active && (
                    <span className="absolute top-2 right-2 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full" style={{ background: 'var(--accent)', color: '#fff' }}>✓</span>
                  )}
                  <div className="w-8 h-8 rounded-full mb-2 border" style={{ background: t.preview, borderColor: 'var(--border-default)' }} />
                  <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.description}</div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Change password */}
        <section className="rounded-2xl p-6 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Mot de passe</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm mb-1 block" style={{ color: 'var(--text-muted)' }}>Nouveau mot de passe</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Au moins 8 caractères"
                autoComplete="new-password"
                className="w-full border rounded-xl px-4 py-2.5 focus:outline-none transition-colors text-sm"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              />
            </div>
            <div>
              <label className="text-sm mb-1 block" style={{ color: 'var(--text-muted)' }}>Confirmer</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full border rounded-xl px-4 py-2.5 focus:outline-none transition-colors text-sm"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              />
            </div>
            {passwordError && (
              <p className="text-xs rounded-xl px-4 py-2.5" style={{ color: '#f87171', background: 'rgba(239,68,68,0.1)' }}>{passwordError}</p>
            )}
            <button
              onClick={savePassword}
              disabled={passwordSaving || !newPassword}
              className="rounded-xl px-6 py-2.5 font-medium text-sm transition-colors disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#fff' }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseOut={e => (e.currentTarget.style.background = 'var(--accent)')}>
              {passwordSaved ? '✓ Mot de passe mis à jour' : passwordSaving ? 'Sauvegarde…' : 'Changer le mot de passe'}
            </button>
          </div>
        </section>

        {/* Danger zone */}
        <section className="rounded-2xl p-6 border" style={{ background: 'var(--bg-surface)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Compte</h2>
          <button
            onClick={signOut}
            className="w-full border rounded-xl py-2.5 text-sm font-medium transition-colors"
            style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#f87171' }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,1)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.background = '' }}
          >
            Se déconnecter
          </button>
        </section>
      </main>
    </div>
  )
}

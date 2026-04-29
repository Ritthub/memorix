'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { themes, ThemeKey } from '@/lib/themes'

const ThemeCtx = createContext<{
  theme: ThemeKey
  setTheme: (t: ThemeKey) => void
}>({ theme: 'slate', setTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>('slate')

  useEffect(() => {
    const saved = localStorage.getItem('memorix_theme') as ThemeKey
    if (saved && themes[saved]) setThemeState(saved)
  }, [])

  useEffect(() => {
    const vars = themes[theme].vars
    const root = document.documentElement
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
    root.setAttribute('data-theme', theme)
    localStorage.setItem('memorix_theme', theme)
  }, [theme])

  function setTheme(t: ThemeKey) {
    setThemeState(t)
  }

  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export const useTheme = () => useContext(ThemeCtx)

export default function ThemeProviderInit() {
  useEffect(() => {
    const saved = localStorage.getItem('memorix_theme') as ThemeKey
    if (saved && themes[saved]) {
      const vars = themes[saved].vars
      const root = document.documentElement
      Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
      root.setAttribute('data-theme', saved)
    }
  }, [])
  return null
}

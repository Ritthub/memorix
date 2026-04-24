'use client'
import { useEffect } from 'react'

export default function ThemeProvider() {
  useEffect(() => {
    const saved = localStorage.getItem('memorix-theme')
    if (saved === 'light') {
      document.documentElement.classList.add('light-mode')
    }
  }, [])

  return null
}

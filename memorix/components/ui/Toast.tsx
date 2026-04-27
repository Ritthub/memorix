'use client'
import { useEffect, useState } from 'react'

export interface ToastProps {
  message: string
  onDone: () => void
}

export default function Toast({ message, onDone }: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const fade = setTimeout(() => setVisible(false), 2000)
    const done = setTimeout(onDone, 2500)
    return () => { clearTimeout(fade); clearTimeout(done) }
  }, [onDone])

  return (
    <div
      className={`pointer-events-none fixed z-[200] transition-opacity duration-500
        top-4 left-1/2 -translate-x-1/2
        sm:top-auto sm:translate-x-0 sm:bottom-6 sm:left-6
        bg-[#1E293B] border border-[#334155] text-[#F1F5F9]
        rounded-xl px-4 py-3 text-sm shadow-lg flex items-center gap-2 whitespace-nowrap
        ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <span className="text-green-400 font-bold">✓</span>
      <span>{message}</span>
    </div>
  )
}

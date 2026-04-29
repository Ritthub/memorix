import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import MobileNav from '@/components/MobileNav'
import { ThemeProvider } from '@/components/ThemeProvider'
import QuickAdd from '@/components/ui/QuickAdd'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-jakarta',
})

export const metadata: Metadata = {
  title: 'Memorix',
  description: 'Apprenez mieux, retenez plus longtemps',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Memorix',
  },
}

export const viewport: Viewport = {
  themeColor: '#4338CA',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${jakarta.variable} pb-16`}>
        <ThemeProvider>
          {children}
          <MobileNav />
          <QuickAdd />
        </ThemeProvider>
      </body>
    </html>
  )
}

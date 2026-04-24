import type { Metadata, Viewport } from 'next'
import './globals.css'
import MobileNav from '@/components/MobileNav'

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
  themeColor: '#534AB7',
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
      <body className="pb-16">
        {children}
        <MobileNav />
      </body>
    </html>
  )
}
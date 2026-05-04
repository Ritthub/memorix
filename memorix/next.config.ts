import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: '/review/:deckId((?!all|custom|theme)[^/]+)',
        destination: '/review/all',
        permanent: false,
      },
      {
        source: '/decks/:id',
        destination: '/themes/:id',
        permanent: false,
      },
      {
        source: '/decks',
        destination: '/library',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  if (
    searchParams.get('error') === 'access_denied' &&
    searchParams.get('error_code') === 'otp_expired'
  ) {
    return NextResponse.redirect(`${origin}/login?message=link_expired`)
  }

  if (code) {
    const redirectUrl = type === 'recovery'
      ? `${origin}/reset-password`
      : `${origin}/`

    // Create the response first so we can attach Set-Cookie headers to it
    const response = NextResponse.redirect(redirectUrl)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            // Write cookies onto the response that will be sent to the browser
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options))
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return response
  }

  return NextResponse.redirect(`${origin}/login`)
}

export const runtime = 'edge'

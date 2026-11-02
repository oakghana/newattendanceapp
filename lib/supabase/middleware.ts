import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  const { response } = await updateSessionWithUser(request)
  return response
}

/**
 * Refreshes the session once and returns the resolved user, so callers (the
 * proxy) don't need a second network round-trip to Supabase Auth per request.
 */
export async function updateSessionWithUser(request: NextRequest): Promise<{ response: NextResponse; user: any | null }> {
  // Avoid expensive network calls for public pages (login, static assets)
  const pathname = request.nextUrl?.pathname || request.url || ''
  if (pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico')) {
    return { response: NextResponse.next({ request }), user: null }
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return { response: NextResponse.next({ request }), user: null }
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
      global: {
        fetch: async (url, options) => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000)
          try {
            return await fetch(url, { ...options, signal: controller.signal })
          } finally {
            clearTimeout(timeout)
          }
        },
      },
    })

    // Refresh the session to update cookies
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return { response: supabaseResponse, user: user ?? null }
  } catch (error: any) {
    if (error?.code === "refresh_token_not_found" || error?.message?.includes("Invalid Refresh Token")) {
      request.cookies.getAll().filter(({ name }) => name.startsWith("sb-")).forEach(({ name }) => {
        supabaseResponse.cookies.set(name, "", { maxAge: 0, expires: new Date(0), path: "/" })
      })
    }
    return { response: supabaseResponse, user: null }
  }
}

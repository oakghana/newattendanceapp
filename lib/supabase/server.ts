import "server-only"
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Ensure this file is only used in server components
if (typeof window !== "undefined") {
  throw new Error("The `server.ts` file should only be used in server components.");
}

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  const cookieStore = await cookies()

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://vgtajtqxgczhjboatvol.supabase.co"
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZndGFqdHF4Z2N6aGpib2F0dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5NzUyNDgsImV4cCI6MjA3MjU1MTI0OH0.EuuTCRC-rDoz_WHl4pwpV6_fEqrqcgGroa4nTjAEn1k"

  // Debug: Log available cookies
  const allCookies = cookieStore.getAll()
  const authCookies = allCookies.filter(c => c.name.includes('sb') || c.name.includes('auth'))
  console.log("[v0] Supabase Server Client - Available auth cookies:", authCookies.map(c => c.name))

  return createSupabaseServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // The "setAll" method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  })
}

export async function createAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://vgtajtqxgczhjboatvol.supabase.co"
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured for server admin actions")
  }

  return createSupabaseServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {
        // No-op for admin client
      },
    },
  })
}

// Helper: create client and attempt to resolve the current user.
// If a refresh token is missing or invalid, clear Supabase-related cookies
// to avoid repeated "Refresh Token Not Found" errors and force a login.
export async function createClientAndGetUser() {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      const msg = (error as any)?.message || ""
      if (/refresh token not found|invalid refresh token/i.test(msg)) {
        // Clear Supabase-related cookies (names containing 'sb' or 'supabase')
        const cookieStore = await cookies()
        const all = cookieStore.getAll()
        for (const c of all) {
          if (/\bsb\b|supabase/i.test(c.name)) {
            try {
              cookieStore.set(c.name, "", { path: "/", expires: new Date(0) })
            } catch {
              // swallowing errors setting cookies in server components
            }
          }
        }
      }
    }

    return { supabase, user: (user as any) || null, authError: error || null }
  } catch (e) {
    return { supabase, user: null, authError: e }
  }
}

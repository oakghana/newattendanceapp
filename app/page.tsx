'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function isTransientAuthCheckError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  return /failed to fetch|network|timeout|timed out|abort|service unavailable|server error/i.test(message)
}

export default function HomePage() {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const checkAuth = async () => {
      try {
        const supabase = createClient()
        let user: { id: string } | null = null
        let authCheckFailed = false

        try {
          const { data: authData, error: authError } = await supabase.auth.getUser()
          user = authData.user
          authCheckFailed = isTransientAuthCheckError(authError)
        } catch (authError) {
          authCheckFailed = isTransientAuthCheckError(authError)
        }

        if (!user) {
          try {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
            user = sessionData.session?.user ?? null
            authCheckFailed = authCheckFailed || isTransientAuthCheckError(sessionError)
          } catch (sessionError) {
            authCheckFailed = authCheckFailed || isTransientAuthCheckError(sessionError)
          }
        }

        if (!isMounted) return

        if (user) {
          router.replace('/dashboard/attendance')
        } else if (authCheckFailed) {
          setError('Unable to verify your session. Check your connection and try again.')
        } else {
          router.replace('/auth/login')
        }
      } catch (error) {
        if (!isMounted) return
        setError(error instanceof Error ? error.message : 'Authentication error')
      } finally {
        if (isMounted) {
          setIsChecking(false)
        }
      }
    }

    checkAuth()

    return () => {
      isMounted = false
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center space-y-4">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
        <h1 className="text-2xl font-bold text-slate-900">QCC HR Apps</h1>
        <p className="text-slate-600">
          {error ? `Error: ${error}` : isChecking ? 'Checking your account, please wait...' : 'Redirecting you now...'}
        </p>
      </div>
    </div>
  )
}

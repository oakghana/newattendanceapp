'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function HomePage() {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const checkAuth = async () => {
      try {
        const supabase = createClient()
        
        // Add a small delay to ensure cookies are properly set
        await new Promise(resolve => setTimeout(resolve, 100))
        
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (!isMounted) return

        if (authError) {
          // Auth error means not authenticated
          router.push('/auth/login')
        } else if (user) {
          // User is authenticated, redirect to attendance
          router.push('/dashboard/attendance')
        } else {
          // No user and no error means not authenticated
          router.push('/auth/login')
        }
      } catch (error) {
        if (!isMounted) return
        // If there's an error checking auth, redirect to login
        setError(error instanceof Error ? error.message : 'Authentication error')
        router.push('/auth/login')
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
        <h1 className="text-2xl font-bold text-slate-900">QCC ATTENDANCE APP👋</h1>
        <p className="text-slate-600">
          {error ? `Error: ${error}` : isChecking ? 'Checking your account, please wait...' : 'Redirecting you now...'}
        </p>
      </div>
    </div>
  )
}

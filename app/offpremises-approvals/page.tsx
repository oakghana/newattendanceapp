'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle, ArrowLeft, MapPin } from 'lucide-react'
import { PendingOffPremisesRequests } from '@/components/admin/pending-offpremises-requests'

export default function OffPremisesApprovalPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push('/dashboard/overview')
  }

  useEffect(() => {
    let isMounted = true

    const checkAuthorization = async () => {
      try {
        const supabase = createClient()

        // Check authentication
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (!isMounted) return

        if (authError || !authUser) {
          router.push('/auth/login')
          return
        }

        // Fetch user profile to verify permissions
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', authUser.id)
          .maybeSingle()

        if (!isMounted) return

        if (profileError || !profile) {
          setError('Unable to verify user permissions. Please try again.')
          return
        }

        // Check if user has permission to view this page
        const hasPermission = ['admin', 'department_head', 'regional_manager'].includes(profile.role)
        if (!hasPermission) {
          setError('You do not have permission to view this page')
          return
        }

        setIsAuthorized(true)
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'An unexpected error occurred')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    checkAuthorization()

    return () => {
      isMounted = false
    }
  }, [router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-8 px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard/overview')}
            className="mb-4 ml-2"
          >
            Go Dashboard
          </Button>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  if (!isAuthorized) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard/overview')}
            className="mb-4 ml-2"
          >
            Go Dashboard
          </Button>
          
          <div>
            <div className="flex items-center gap-3 mb-2">
              <MapPin className="h-6 w-6 text-blue-600" />
              <h1 className="text-3xl font-bold">Off-Premises Check-In Approvals</h1>
            </div>
            <p className="text-gray-600 ml-9">
              Review and approve staff requests for off-premises check-ins
            </p>
          </div>
        </div>

        {/* Pending Requests Component */}
        <PendingOffPremisesRequests />
      </div>
    </div>
  )
}

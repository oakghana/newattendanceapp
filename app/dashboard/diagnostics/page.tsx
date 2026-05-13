"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle2, XCircle, AlertTriangle, LogOut } from "lucide-react"

export default function AuthDiagnosticsPage() {
  const [authStatus, setAuthStatus] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()
        
        // Check session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          setError(`Session Error: ${sessionError.message}`)
          setLoading(false)
          return
        }

        if (!session) {
          setAuthStatus({ authenticated: false, reason: "No active session" })
          setLoading(false)
          return
        }

        // Get user
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        if (userError) {
          setError(`User Error: ${userError.message}`)
          setLoading(false)
          return
        }

        setAuthStatus({
          authenticated: !!user,
          user: user ? { id: user.id, email: user.email } : null,
          sessionValid: true
        })

        // Get profile
        if (user) {
          const { data: profileData, error: profileError } = await supabase
            .from("user_profiles")
            .select("id, first_name, last_name, role, email")
            .eq("id", user.id)
            .single()

          if (profileError) {
            setError(`Profile Error: ${profileError.message}`)
          } else {
            setProfile(profileData)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const handleRetryDashboard = () => {
    router.push("/dashboard")
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="max-w-md w-full p-8">
          <div className="flex justify-center mb-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
          <p className="text-center text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Authentication Status</h1>
          <p className="text-muted-foreground">Diagnosing login and access issues</p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {authStatus?.authenticated ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Authenticated
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  Not Authenticated
                </>
              )}
            </CardTitle>
            <CardDescription>Session and user status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {authStatus?.authenticated ? (
              <>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-900 mb-2">User Information</h3>
                  <div className="space-y-2 text-sm text-green-800">
                    <p><strong>Email:</strong> {authStatus.user?.email}</p>
                    <p><strong>User ID:</strong> {authStatus.user?.id}</p>
                  </div>
                </div>

                {profile ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">Profile Information</h3>
                    <div className="space-y-2 text-sm text-blue-800">
                      <p><strong>Name:</strong> {profile.first_name} {profile.last_name}</p>
                      <p><strong>Role:</strong> {profile.role}</p>
                      <p><strong>Email:</strong> {profile.email}</p>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Profile Missing</AlertTitle>
                    <AlertDescription>
                      Your user profile was not found in the system. Please contact support.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            ) : (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No Active Session</AlertTitle>
                <AlertDescription>
                  {authStatus?.reason || "You are not logged in. Your session may have expired."}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>What would you like to do?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {authStatus?.authenticated && profile ? (
              <>
                <Button onClick={handleRetryDashboard} className="w-full" size="lg">
                  Try Accessing Dashboard Again
                </Button>
                <Button onClick={handleLogout} variant="outline" className="w-full" size="lg">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout & Login Again
                </Button>
              </>
            ) : (
              <Button onClick={handleLogout} className="w-full" size="lg">
                Go to Login
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Troubleshooting Guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <h4 className="font-semibold mb-1">If you see "Unauthorized":</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Your session may have expired - try logging out and logging back in</li>
                <li>Clear your browser cookies and try again</li>
                <li>Try accessing from a private/incognito window</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-1">If you're authenticated but can't access the dashboard:</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Your user profile may not be set up correctly</li>
                <li>Your account role may not have dashboard access</li>
                <li>Contact your system administrator for assistance</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


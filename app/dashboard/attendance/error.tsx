"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Home, RotateCcw } from "lucide-react"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[attendance] route error:", error)
  }, [error])

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-amber-200">
        <CardHeader>
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <CardTitle>Attendance is temporarily unavailable</CardTitle>
          </div>
          <CardDescription>
            We hit a temporary issue while loading this page. Your account is safe. Please retry or go back to your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={reset} className="flex-1">
            <RotateCcw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => (window.location.href = "/dashboard") }>
            <Home className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
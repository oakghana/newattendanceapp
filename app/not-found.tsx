"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Home, ArrowLeft } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="flex justify-center mb-4">
            <Image src="/images/qcc-logo.png" alt="QCC Logo" width={60} height={60} className="rounded-full" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">Page Not Found</CardTitle>
          <CardDescription className="text-base">
            The page you're looking for doesn't exist or has been moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-6xl font-bold text-muted-foreground/50 mb-4">404</div>
          <div className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/dashboard">
                <Home className="h-4 w-4 mr-2" />
                Go to Dashboard
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full bg-transparent"
              onClick={() => router.back()}
            >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-6">QCC Electronic Attendance App</p>
        </CardContent>
      </Card>
    </div>
  )
}

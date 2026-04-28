"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import Image from "next/image"
import { CheckCircle } from "lucide-react"

export default function VerifyEmailPage() {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/auth/login")
    }, 3000)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-lg border-0 bg-card/95 backdrop-blur">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <Image src="/images/qcc-logo.png" alt="QCC Logo" width={80} height={80} className="rounded-full" />
            </div>
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-primary">Registration Complete! 🎉</CardTitle>
              <CardDescription className="text-muted-foreground">
                Akwaaba! Your account has been created successfully
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Email verification is no longer required. Your account is now waiting for admin approval.
            </p>
            <p className="text-sm text-muted-foreground">
              You will be redirected to login shortly, or you can continue now.
            </p>
            <div className="pt-4">
              <Button asChild className="w-full bg-gradient-to-r from-green-600 to-orange-600">
                <Link href="/auth/login">Continue to Sign In</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

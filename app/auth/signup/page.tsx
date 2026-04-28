"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import Image from "next/image"

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-card to-secondary/5 p-4">
      <div className="w-full max-w-lg">
        <Card className="shadow-2xl border-0 bg-card/98 backdrop-blur-sm">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="flex justify-center">
              <div className="relative">
                <Image
                  src="/images/qcc-logo.png"
                  alt="QCC Logo"
                  width={90}
                  height={90}
                  className="rounded-full shadow-lg"
                />
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary/20 to-secondary/20"></div>
              </div>
            </div>
            <div>
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                QCC Electronic Attendance 🇬🇭
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-2">Account Registration Info</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="border-secondary/50 bg-secondary/10">
              <AlertDescription className="text-center">
                <strong>👋 Hey there! Self-registration is closed.</strong>
                <br />
                To get your account, simply contact your IT Manager or Regional IT Head — they'll sort you out quickly!
                <br />
                📞 The IT Department is here to help you get started.
              </AlertDescription>
            </Alert>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account? 🙌{" "}
                <Link
                  href="/auth/login"
                  className="font-semibold text-secondary hover:text-secondary/80 underline underline-offset-4 transition-colors"
                >
                  Sign in here
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

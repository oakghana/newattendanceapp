"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Clock, CheckCircle, Mail, Shield } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-card to-secondary/5 p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-2xl border-0 bg-card/98 backdrop-blur-sm">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="flex justify-center">
              <div className="relative">
                <Image
                  src="/images/qcc-logo.png"
                  alt="QCC Logo"
                  width={80}
                  height={80}
                  className="rounded-full shadow-lg"
                />
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary/20 to-secondary/20"></div>
              </div>
            </div>
            <div>
              <CardTitle className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Account Received! Awaiting Approval ⏳
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-2">
                Your registration is complete — just sit tight while admin activates your account
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="relative">
                  <Clock className="h-16 w-16 text-secondary animate-pulse" />
                  <div className="absolute -top-1 -right-1">
                    <div className="h-4 w-4 bg-secondary rounded-full animate-ping"></div>
                  </div>
                </div>
              </div>

              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 font-medium">
                  ✅ Account created successfully!
                  <br />✅ Email verified — you're good!
                  <br />⏳ Admin will activate you shortly
                </AlertDescription>
              </Alert>

              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 justify-center">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <span>Your account is safe and secure 🔒</span>
                </div>
                <div className="flex items-center gap-2 justify-center">
                  <Mail className="h-4 w-4 text-green-600" />
                  <span>You'll get an email once you're activated 📬</span>
                </div>
                <p>Your admin will review and activate your account within 24–48 hours. Medaase for your patience! 🙏</p>
                <p className="text-xs">Need it sooner? Reach out directly to the IT Department.</p>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                asChild
                className="w-full h-11 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
              >
                <Link href="/auth/login">Try Login Again</Link>
              </Button>

              <Button asChild variant="outline" className="w-full h-11 border-2 hover:bg-secondary/10 bg-transparent">
                <Link href="/">Back to Home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

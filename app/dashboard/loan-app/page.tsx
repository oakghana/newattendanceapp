"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Banknote, Clock, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function LoanAppPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 p-5">
              <Banknote className="h-10 w-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold">Loan Application Portal</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            Staff Loan &amp; Financial Assistance Requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4">
            <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
              <Clock className="h-5 w-5 flex-shrink-0" />
              <span className="font-semibold text-sm">Under Review</span>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
              This module is currently under review and has been commissioned by management.
              It will be made available to all staff very soon.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Once live, you will be able to submit loan requests directly to management for review and approval.
            You will be notified as soon as the portal is open.
          </p>
          <Link href="/dashboard/overview">
            <Button variant="outline" className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

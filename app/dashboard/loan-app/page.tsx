"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

export default function LoanAppPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/api/workflow/inbox")
        if (!response.ok) {
          throw new Error("Failed to load loan data")
        }
        const result = await response.json()
        setData(result)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Loan System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-600">{error}</p>
            <Link href="/dashboard">
              <Button className="w-full" variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>QCC Loan Processing</CardTitle>
            <CardDescription>Loading loan system...</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">QCC Loan Processing Hub</h1>
          <p className="text-slate-600 mt-1">Staff Welfare Loan Application System</p>
        </div>
        <Link href="/dashboard">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>Loan processing system is online</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-600">My Requests</p>
              <p className="text-2xl font-bold text-slate-900">{data?.myRequests?.length || 0}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-600">Pending Tasks</p>
              <p className="text-2xl font-bold text-slate-900">{data?.myTasks?.length || 0}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-600">Pending HOD Review</p>
              <p className="text-2xl font-bold text-slate-900">{data?.inbox?.hod?.length || 0}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-600">Total Loan Types</p>
              <p className="text-2xl font-bold text-slate-900">{data?.loanTypes?.length || 0}</p>
            </div>
          </div>
          
          <div className="pt-4 border-t">
            <p className="text-sm text-slate-600 mb-3">Available Actions</p>
            <div className="space-y-2">
              <Link href="/dashboard/loan-app/new-request">
                <Button className="w-full" variant="default">
                  Submit New Loan Request
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button className="w-full" variant="outline">
                  View Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            The QCC Loan Processing Hub is now online and ready for use. You can submit new loan requests or view your existing requests.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Download, Clock, CheckCircle2, AlertCircle } from "lucide-react"
import { fmtDate } from "@/lib/date-fmt"

interface PaymentAdvice {
  id: string
  leaveType: string
  leaveYear: string
  staffCategory: string
  approvedDays: number
  paymentAmount: number | null
  status: string
  createdAt: string
  forwardedAt: string | null
  acknowledgedAt: string | null
}

export default function StaffPaymentAdviceStatus() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [memos, setMemos] = useState<PaymentAdvice[]>([])

  useEffect(() => {
    fetchPaymentAdviceStatus()
  }, [])

  const fetchPaymentAdviceStatus = async () => {
    try {
      const response = await fetch("/api/leave/payment-advice/my-status")
      if (!response.ok) throw new Error("Failed to fetch payment advice status")
      const data = await response.json()
      setMemos(data.memos || [])
    } catch (err: any) {
      toast({ 
        title: "Error", 
        description: err.message || "Failed to load payment advice status", 
        variant: "destructive" 
      })
    } finally {
      setLoading(false)
    }
  }

  const downloadMemo = (memoId: string) => {
    window.open(`/api/leave/payment-advice/download?memo_id=${memoId}`, "_blank")
  }

  const getStatusBadge = (status: string, forwardedAt: string | null) => {
    if (!forwardedAt) {
      return <Badge variant="outline" className="bg-yellow-50"><Clock className="h-3 w-3 mr-1" />Processing</Badge>
    }
    if (status === "acknowledged") {
      return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Received</Badge>
    }
    return <Badge variant="outline" className="bg-blue-50"><AlertCircle className="h-3 w-3 mr-1" />Sent to Finance</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (memos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Advice Status</CardTitle>
          <CardDescription>Track when your leave payment advice has been processed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No payment advice records found for your account</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Advice Status</CardTitle>
        <CardDescription>Your leave payment advice has been processed by HR and forwarded to Finance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {memos.map((memo) => (
          <div key={memo.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1 flex-1">
                <p className="font-semibold text-sm">
                  {memo.leaveType} Leave - {memo.leaveYear}
                </p>
                <p className="text-xs text-gray-600">
                  {memo.staffCategory} Staff • {memo.approvedDays} days approved
                </p>
              </div>
              {getStatusBadge(memo.status, memo.forwardedAt)}
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-600">Processed on:</span>
                <p className="font-medium">{fmtDate(memo.createdAt)}</p>
              </div>
              {memo.forwardedAt && (
                <div>
                  <span className="text-gray-600">Sent to Finance:</span>
                  <p className="font-medium">{fmtDate(memo.forwardedAt)}</p>
                </div>
              )}
            </div>

            {memo.paymentAmount && (
              <div className="bg-green-50 border border-green-200 rounded px-3 py-2">
                <p className="text-xs text-green-700">
                  <span className="font-semibold">Amount:</span> {memo.paymentAmount.toFixed(2)}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => downloadMemo(memo.id)}
              >
                <Download className="h-3 w-3" />
                View Payment Advice
              </Button>
              {memo.forwardedAt && (
                <span className="text-xs text-green-700 self-center">
                  ✓ Copy available for download
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

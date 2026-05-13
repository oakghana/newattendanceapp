"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Check, X, Edit2, AlertCircle, ChevronRight, Calendar, Clock } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface PendingChange {
  id: string
  requestId: string
  staffName: string
  proposedStartDate: Date
  proposedEndDate: Date
  originalStartDate: Date
  originalEndDate: Date
  reason: string
  proposedBy: string
  createdAt: Date
  status: "pending" | "accepted" | "rejected" | "countered"
}

interface PendingChangeCardProps {
  change: PendingChange
  onAccept: (changeId: string) => Promise<void>
  onReject: (changeId: string) => Promise<void>
  onCounterPropose: (changeId: string, newStart: Date, newEnd: Date, reason: string) => Promise<void>
  isStaff: boolean
}

export function PendingChangeCard({
  change,
  onAccept,
  onReject,
  onCounterPropose,
  isStaff,
}: PendingChangeCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showCounterForm, setShowCounterForm] = useState(false)
  const [counterStart, setCounterStart] = useState(change.proposedStartDate.toISOString().split("T")[0])
  const [counterEnd, setCounterEnd] = useState(change.proposedEndDate.toISOString().split("T")[0])
  const [counterReason, setCounterReason] = useState("")

  const formatDate = (date: Date) => new Date(date).toLocaleDateString("en-GB", { 
    day: "numeric", 
    month: "short", 
    year: "numeric" 
  })

  const originalDays = Math.ceil(
    (new Date(change.originalEndDate).getTime() - new Date(change.originalStartDate).getTime()) / 
    (1000 * 60 * 60 * 24)
  ) + 1

  const proposedDays = Math.ceil(
    (new Date(change.proposedEndDate).getTime() - new Date(change.proposedStartDate).getTime()) / 
    (1000 * 60 * 60 * 24)
  ) + 1

  const handleAccept = async () => {
    try {
      setIsLoading(true)
      await onAccept(change.id)
      toast({
        title: "Changes Accepted",
        description: `You've accepted the date changes proposed by ${change.proposedBy}`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not accept changes. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleReject = async () => {
    try {
      setIsLoading(true)
      await onReject(change.id)
      toast({
        title: "Changes Rejected",
        description: `You've rejected the date changes. Original dates will be kept.`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not reject changes. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCounterPropose = async () => {
    if (!counterStart || !counterEnd || !counterReason.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide all fields for your counter-proposal.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)
      await onCounterPropose(
        change.id,
        new Date(counterStart),
        new Date(counterEnd),
        counterReason
      )
      toast({
        title: "Counter-Proposal Sent",
        description: `Your alternative dates have been sent to ${change.proposedBy} for review.`,
      })
      setShowCounterForm(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not send counter-proposal. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (change.status === "accepted") {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-900">Changes Accepted</p>
              <p className="text-sm text-green-700">Your leave dates have been updated</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (change.status === "rejected") {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <X className="h-5 w-5 text-red-600" />
            <div>
              <p className="font-medium text-red-900">Changes Rejected</p>
              <p className="text-sm text-red-700">Original dates remain unchanged</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Date Change Proposal
            </CardTitle>
            <CardDescription className="text-blue-100">
              {change.proposedBy} has suggested changes to your leave dates
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-4">
        {/* Original vs Proposed Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Original Dates</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span className="font-medium">{formatDate(change.originalStartDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span className="font-medium">{formatDate(change.originalEndDate)}</span>
              </div>
              <div className="text-xs text-slate-500 mt-2 pt-2 border-t">
                {originalDays} day{originalDays !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          <div className="rounded-lg border-2 border-blue-400 bg-blue-50 p-4">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">✨ Proposed Dates</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-900">{formatDate(change.proposedStartDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-900">{formatDate(change.proposedEndDate)}</span>
              </div>
              <div className="text-xs text-blue-700 mt-2 pt-2 border-t border-blue-200">
                {proposedDays} day{proposedDays !== 1 ? "s" : ""} 
                {proposedDays !== originalDays && ` (${proposedDays > originalDays ? "+" : ""} ${proposedDays - originalDays})`}
              </div>
            </div>
          </div>
        </div>

        {/* Reason */}
        {change.reason && (
          <Alert className="border-blue-200 bg-white">
            <Clock className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              <p className="text-sm font-medium text-slate-700">Reason for changes:</p>
              <p className="text-sm text-slate-600 mt-1">{change.reason}</p>
            </AlertDescription>
          </Alert>
        )}

        {/* Counter Proposal Form */}
        {showCounterForm && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Your Counter-Proposal</p>
            
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Alternative Start Date</label>
              <input
                type="date"
                value={counterStart}
                onChange={(e) => setCounterStart(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Alternative End Date</label>
              <input
                type="date"
                value={counterEnd}
                onChange={(e) => setCounterEnd(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Your Reason</label>
              <textarea
                value={counterReason}
                onChange={(e) => setCounterReason(e.target.value)}
                placeholder="Why do you prefer these dates?"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCounterPropose}
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                size="sm"
              >
                Send Counter-Proposal
              </Button>
              <Button
                onClick={() => setShowCounterForm(false)}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!showCounterForm && (
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleAccept}
              disabled={isLoading}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium"
              size="sm"
            >
              <Check className="h-4 w-4 mr-2" />
              Accept Changes
            </Button>

            <Button
              onClick={() => setShowCounterForm(true)}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Counter-Propose
            </Button>

            <Button
              onClick={handleReject}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

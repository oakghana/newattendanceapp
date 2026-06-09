'use client'

import { useState, useCallback, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertCircle, CheckCircle2, Search } from 'lucide-react'

interface ApprovedLeaveRequest {
  id: string
  user_id: string
  start_date: string
  end_date: string
  reason: string
  leave_type: string
  status: string
  created_at: string
  user_name: string
  location?: string
  department?: string
  rank?: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  userId: string
  userRole: string
  approvedLeaves: ApprovedLeaveRequest[]
  onSuccess?: () => void
}

const currentYear = new Date().getFullYear()
const deferralYears = Array.from({ length: 5 }, (_, i) => currentYear + i)

export function SubmitNewDefermentRequest({
  isOpen,
  onClose,
  userId,
  userRole,
  approvedLeaves,
  onSuccess,
}: Props) {
  const [selectedLeave, setSelectedLeave] = useState<ApprovedLeaveRequest | null>(null)
  const [deferralYear, setDeferralYear] = useState<string>(String(currentYear + 1))
  const [reason, setReason] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const roleNorm = userRole?.toLowerCase().replace(/[\s-]+/g, '_') || ''
  const isStaff = !['admin', 'regional_manager', 'department_head', 'hr_officer', 'hr_leave_office', 'hr_office', 'hr', 'manager_hr', 'director_hr', 'hr_director'].includes(roleNorm)
  const isManagerRole = ['regional_manager', 'department_head', 'hr_officer', 'hr_leave_office', 'hr_office', 'hr', 'admin', 'manager_hr', 'director_hr', 'hr_director'].includes(roleNorm)

  // Filter leaves based on user role
  const filteredLeaves = useMemo(() => {
    let leaves = approvedLeaves
    
    // Only annual leave can be deferred
    leaves = leaves.filter(leave => String(leave.leave_type || "").toLowerCase() === "annual")
    
    // Staff can only see their own approved leaves
    if (isStaff) {
      leaves = leaves.filter(leave => leave.user_id === userId)
    }
    
    // Apply search filter for both staff and managers
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      leaves = leaves.filter(leave =>
        leave.user_name.toLowerCase().includes(query) ||
        leave.reason.toLowerCase().includes(query) ||
        leave.department?.toLowerCase().includes(query) ||
        leave.location?.toLowerCase().includes(query)
      )
    }
    
    return leaves
  }, [approvedLeaves, userId, isStaff, searchQuery])

  const handleSubmit = useCallback(async () => {
    if (!selectedLeave || !deferralYear) {
      setError('Please select a leave and deferral year')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch('/api/leave/deferment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_plan_request_id: selectedLeave.id,
          deferral_year: deferralYear,
          reason: reason || null,
          user_id: selectedLeave.user_id,
          requester_id: userId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to submit deferment request')
      }

      setSuccess(true)
      setTimeout(() => {
        setSelectedLeave(null)
        setReason('')
        setSearchQuery('')
        onClose()
        onSuccess?.()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [selectedLeave, deferralYear, reason, userId, onClose, onSuccess])

  const handleClose = useCallback(() => {
    if (!isLoading) {
      setSelectedLeave(null)
      setReason('')
      setSearchQuery('')
      setError(null)
      setSuccess(false)
      onClose()
    }
  }, [isLoading, onClose])

  // Calculate leave duration
  const leaveDays = selectedLeave
    ? Math.ceil((new Date(selectedLeave.end_date).getTime() - new Date(selectedLeave.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Submit New Deferment Request</DialogTitle>
          <DialogDescription>
            {isStaff
              ? 'Select one of your approved annual leave requests to defer to a future year'
              : 'Select a staff member\'s approved leave to defer to a future year'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Success State */}
          {success && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Deferment request submitted successfully! Awaiting HOD/RM endorsement.
              </AlertDescription>
            </Alert>
          )}

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 text-slate-400 -translate-y-1/2" />
            <Input
              placeholder={isStaff ? "Search your leaves..." : "Search staff member or department..."}
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Leave Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              Select Leave to Defer <span className="text-red-500">*</span>
            </label>
            
            {filteredLeaves.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
                <p className="text-slate-500">
                  {searchQuery
                    ? 'No leaves found matching your search'
                    : isStaff
                    ? 'No approved leaves available for deferment'
                    : 'No approved leaves available'}
                </p>
              </div>
            ) : (
              <div className="grid gap-2 max-h-72 overflow-y-auto">
                {filteredLeaves.map((leave) => (
                  <button
                    key={leave.id}
                    onClick={() => setSelectedLeave(leave)}
                    disabled={isLoading}
                    className={`text-left p-4 rounded-lg border-2 transition-all ${
                      selectedLeave?.id === leave.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{leave.user_name}</p>
                        <p className="text-sm text-slate-600 mt-1">
                          {new Date(leave.start_date).toLocaleDateString()} - {new Date(leave.end_date).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="ml-2 flex-shrink-0">
                        {leave.leave_type}
                      </Badge>
                    </div>
                    {leave.reason && (
                      <p className="text-sm text-slate-600 mb-2">{leave.reason.substring(0, 60)}...</p>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {leave.department && (
                        <Badge variant="secondary" className="text-xs">
                          {leave.department}
                        </Badge>
                      )}
                      {leave.location && (
                        <Badge variant="secondary" className="text-xs">
                          {leave.location}
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Leave Details */}
          {selectedLeave && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Leave Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600">Duration</p>
                    <p className="font-semibold text-slate-900">{leaveDays} days</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Type</p>
                    <p className="font-semibold text-slate-900 capitalize">{selectedLeave.leave_type}</p>
                  </div>
                </div>
                {selectedLeave.reason && (
                  <div>
                    <p className="text-slate-600 text-sm">Reason</p>
                    <p className="text-slate-900 text-sm font-medium">{selectedLeave.reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Deferral Year Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">
                Defer to Year <span className="text-red-500">*</span>
              </label>
              <Select value={deferralYear} onValueChange={setDeferralYear} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deferralYears.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}/{year + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reason for Deferment */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              Reason for Deferment
            </label>
            <Textarea
              placeholder="Explain why this leave is being deferred (optional)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
              className="resize-none"
              rows={3}
            />
            <p className="text-xs text-slate-500">Optional - provide context for the deferment</p>
          </div>

          {/* Info Box */}
          <Alert className="border-slate-200 bg-slate-50">
            <AlertCircle className="h-4 w-4 text-slate-600" />
            <AlertDescription className="text-sm text-slate-700">
              {isStaff
                ? 'Your deferment request will be sent to your HOD/RM for endorsement before being processed by HR.'
                : 'This deferment request will be sent to HR for final processing.'}
            </AlertDescription>
          </Alert>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="px-6"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedLeave || isLoading || !deferralYear}
            className="px-6"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Submitting...' : 'Submit Request'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

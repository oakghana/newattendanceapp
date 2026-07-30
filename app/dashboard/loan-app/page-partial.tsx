'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Upload } from 'lucide-react'

const LOAN_TYPES = [
  { key: 'education', label: 'Education Loan', amount: 8000, fd_required: false, committee_required: false },
  { key: 'motor', label: 'Motor Loan', amount: 10000, fd_required: true, committee_required: false },
  { key: 'housing', label: 'Housing Loan', amount: 15000, fd_required: true, committee_required: true },
  { key: 'salary_advance', label: 'Salary Advance', amount: 5000, fd_required: false, committee_required: false },
]

export default function LoanAppPage() {
  const { toast } = useToast()
  const [staffInfo, setStaffInfo] = useState<any>(null)
  const [selectedLoan, setSelectedLoan] = useState('')
  const [reason, setReason] = useState('')
  const [fileName, setFileName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [myRequests, setMyRequests] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('my-loans')

  // Load staff info on mount
  useEffect(() => {
    const loadStaffInfo = async () => {
      try {
        const response = await fetch('/api/loan/workflow')
        const data = await response.json()
        if (data.staff) setStaffInfo(data.staff)
        if (data.requests) setMyRequests(data.requests)
      } catch (error) {
        console.log("[v0] Failed to load staff info:", error)
      }
    }
    loadStaffInfo()
  }, [])

  const selectedLoanType = LOAN_TYPES.find(l => l.key === selectedLoan)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFileName(e.target.files[0].name)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLoan) {
      toast({ title: 'Error', description: 'Please select a loan type', variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/loan/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_type_key: selectedLoan,
          requested_amount: selectedLoanType?.amount,
          reason: reason || null,
        }),
      })

      const result = await response.json()
      if (response.ok) {
        toast({ title: 'Success', description: 'Loan request submitted successfully' })
        setSelectedLoan('')
        setReason('')
        setFileName('')
      } else {
        toast({ title: 'Error', description: result.message || 'Failed to submit request', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Network error submitting request', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-purple-100 to-purple-50 border-b border-purple-200 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Staff Welfare Loan Workspace</p>
              <h1 className="text-3xl font-bold text-gray-900 mt-2">QCC Loan Processing Hub</h1>
            </div>
            <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
              {staffInfo?.first_name?.charAt(0)}{staffInfo?.last_name?.charAt(0)}
            </div>
          </div>

          {/* Staff Info Grid */}
          {staffInfo && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <p className="text-xs text-gray-600 font-medium">Corporate Email</p>
                <p className="text-sm font-semibold text-gray-900">{staffInfo.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Staff Number</p>
                <p className="text-sm font-semibold text-gray-900">{staffInfo.staff_number || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Station / Department</p>
                <p className="text-sm font-semibold text-gray-900">{staffInfo.department || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Rank / Position</p>
                <p className="text-sm font-semibold text-gray-900">{staffInfo.position || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Category</p>
                <p className="text-sm font-semibold"><span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">{staffInfo.category || 'N/A'}</span></p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Assigned Location</p>
                <p className="text-sm font-semibold text-gray-900">{staffInfo.location || 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Linked HOD</p>
                <p className="text-sm font-semibold text-gray-900">{staffInfo.hod_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Location Address</p>
                <p className="text-sm font-semibold text-gray-900">{staffInfo.address || 'N/A'}</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setActiveTab('my-loans')}
              className={`py-3 px-4 rounded-lg font-semibold text-center transition-all ${
                activeTab === 'my-loans'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-white text-purple-600 border-2 border-purple-600 hover:bg-purple-50'
              }`}
            >
              My Loans
            </button>
            <button
              onClick={() => setActiveTab('tracking')}
              className={`py-3 px-4 rounded-lg font-semibold text-center transition-all ${
                activeTab === 'tracking'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-white text-purple-600 border-2 border-purple-600 hover:bg-purple-50'
              }`}
            >
              Tracking
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-6">
        {activeTab === 'my-loans' && (
          <div className="space-y-6">
            {/* New Loan Request Form */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-2">New Loan Request</h2>
              <p className="text-sm text-gray-600 mb-6">Loan amount is fixed by selected loan type and auto-populated in GHc.</p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="loan-type" className="font-semibold text-gray-900">Loan Type</Label>
                    <Select value={selectedLoan} onValueChange={setSelectedLoan}>
                      <SelectTrigger id="loan-type" className="bg-purple-600 text-white border-purple-600 mt-2">
                        <SelectValue placeholder="Select loan type" />
                      </SelectTrigger>
                      <SelectContent>
                        {LOAN_TYPES.map(loan => (
                          <SelectItem key={loan.key} value={loan.key}>
                            {loan.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedLoanType && (
                      <p className="text-xs text-gray-600 mt-2">
                        Fixed amount: GH¢ {selectedLoanType.amount.toFixed(2)} | FD check: {selectedLoanType.fd_required ? 'Required' : 'Not required'} | Committee: {selectedLoanType.committee_required ? 'Required' : 'Not required'} | Qualification: Junior and above
                      </p>
                    )}
                  </div>

                  {selectedLoanType && (
                    <div>
                      <Label className="font-semibold text-gray-900">Requested Amount (GH₵)</Label>
                      <Input type="text" value={selectedLoanType.amount.toFixed(2)} readOnly disabled className="mt-2 bg-gray-100" />
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="reason" className="font-semibold text-gray-900">Reason (Optional)</Label>
                  <Textarea
                    id="reason"
                    placeholder="You can add reason if needed"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label className="font-semibold text-gray-900">Supporting Attachment (Optional)</Label>
                  <div className="mt-2 relative">
                    <input
                      type="file"
                      onChange={handleFileChange}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:bg-gray-50"
                    >
                      <div className="text-center">
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <span className="text-sm text-gray-600">{fileName || 'Choose File No file chosen'}</span>
                      </div>
                    </label>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Request'}
                </Button>
              </form>
            </div>

            {/* My Requests Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-6">My Requests</h2>
              {myRequests.length === 0 ? (
                <p className="text-gray-600">No loan requests yet.</p>
              ) : (
                <div className="space-y-3">
                  {myRequests.map((request: any) => (
                    <div key={request.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-900">{request.loan_type}</p>
                          <p className="text-sm text-gray-600">Amount: GH₵ {request.requested_amount?.toFixed(2)}</p>
                        </div>
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                          request.status === 'approved' ? 'bg-green-100 text-green-800' :
                          request.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {request.status?.toUpperCase() || 'PENDING'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tracking' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Loan Tracking</h2>
            <p className="text-gray-600">Track the status and progress of your loan requests here.</p>
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import { useState, useMemo } from "react"
import { format } from "date-fns"
import { Download, Loader2, FileText, Users, Calendar, Check } from "lucide-react"
import { jsPDF } from "jspdf"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

interface StaffOnLeave {
  id: string
  full_name: string
  employee_id: string
  department_name: string
  position: string
  staff_category: string
  start_date: string
  end_date: string
  leave_type: string
}

export function PaymentAdviceClient() {
  const { toast } = useToast()
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [isLoading, setIsLoading] = useState(false)
  const [staffList, setStaffList] = useState<StaffOnLeave[]>([])
  const [memos, setMemos] = useState<Record<string, string>>({})
  const [memoSummary, setMemoSummary] = useState<any>(null)
  const [selectedMemoCategory, setSelectedMemoCategory] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Group staff by category
  const staffByCategory = useMemo(() => {
    return staffList.reduce(
      (acc, staff) => {
        const category = staff.staff_category || "Junior"
        if (!acc[category]) acc[category] = []
        acc[category].push(staff)
        return acc
      },
      {
        Manager: [] as StaffOnLeave[],
        Senior: [] as StaffOnLeave[],
        Junior: [] as StaffOnLeave[],
      } as Record<string, StaffOnLeave[]>
    )
  }, [staffList])

  // Detect staff on leave
  const handleDetectStaff = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/leave/payment-advice/detect-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || error.error || "Failed to detect staff")
      }

      const data = await response.json()
      setStaffList(data.staff || [])
      setMemos({})
      setMemoSummary(null)

      if ((data.staff || []).length === 0) {
        toast({
          title: "No Staff Found",
          description: `No staff are scheduled on annual leave for ${selectedMonth}.`,
          variant: "default",
        })
      } else {
        toast({
          title: "Staff Detected",
          description: `Found ${data.staff.length} staff members on annual leave.`,
        })
      }
    } catch (err: any) {
      console.error("[v0] Error detecting staff:", err)
      toast({
        title: "Error",
        description: err.message || "Failed to detect staff. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Generate memos
  const handleGenerateMemos = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/leave/payment-advice/generate-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          staffList,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || error.error || "Failed to generate memos")
      }

      const data = await response.json()
      setMemos(data.memos)
      setMemoSummary(data.summary)
      setSelectedMemoCategory(Object.keys(data.memos)[0])

      toast({
        title: "Memos Generated",
        description: `${Object.keys(data.memos).length} professional memos ready for review.`,
      })
    } catch (err: any) {
      console.error("[v0] Error generating memos:", err)
      toast({
        title: "Error",
        description: err.message || "Failed to generate memos. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Submit memos
  const handleSubmitMemos = async () => {
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/leave/payment-advice/submit-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          memos,
          staffList,
        }),
      })

      if (!response.ok) throw new Error("Failed to submit memos")

      toast({
        title: "Success",
        description: "Payment advice memos have been saved successfully.",
      })

      setMemos({})
      setStaffList([])
      setMemoSummary(null)
    } catch (err) {
      console.error("[v0] Error submitting memos:", err)
      toast({
        title: "Error",
        description: "Failed to submit memos. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Download memo as PDF
  const handleDownloadMemo = (category: string) => {
    const memo = memos[category]
    if (!memo) return

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      // Add title
      doc.setFontSize(14)
      doc.setFont(undefined, "bold")
      doc.text("PAYMENT OF LEAVE ALLOWANCE", 20, 20)

      // Add metadata
      doc.setFontSize(10)
      doc.setFont(undefined, "normal")
      doc.text(`Category: ${category}`, 20, 30)
      doc.text(`Month: ${selectedMonth}`, 20, 36)
      doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 20, 42)

      // Add separator line
      doc.line(20, 48, 190, 48)

      // Add memo content with text wrapping
      const pageHeight = doc.internal.pageSize.getHeight()
      const pageWidth = doc.internal.pageSize.getWidth()
      const maxWidth = pageWidth - 40
      const splitText = doc.splitTextToSize(memo, maxWidth)

      let yPosition = 55
      const lineHeight = 5
      const pageBreakThreshold = pageHeight - 20

      splitText.forEach((line: string) => {
        if (yPosition > pageBreakThreshold) {
          doc.addPage()
          yPosition = 20
        }
        doc.text(line, 20, yPosition)
        yPosition += lineHeight
      })

      // Save the PDF
      doc.save(`payment-advice-${category}-${selectedMonth}.pdf`)
    } catch (err) {
      console.error("[v0] Error generating PDF:", err)
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Month Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Select Month for Payment Advice
          </CardTitle>
          <CardDescription>Generate professional payment advice memos for annual leave</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="month-select" className="mb-2 block font-medium">
                Month & Year
              </Label>
              <Input
                id="month-select"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-base"
              />
            </div>
            <Button 
              onClick={handleDetectStaff} 
              disabled={isLoading} 
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Detect Staff
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Staff Preview */}
      {staffList.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" />
                Staff on Annual Leave ({staffList.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Category Summary */}
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(staffByCategory).map(([category, staff]) => (
                  <Card key={category} className="bg-slate-50">
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{staff.length}</div>
                        <div className="text-sm text-gray-600 font-medium">{category}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Staff Details */}
              <div className="space-y-4 max-h-64 overflow-y-auto">
                {Object.entries(staffByCategory).map(([category, staff]) => (
                  staff.length > 0 && (
                    <div key={category} className="border rounded-lg p-3 bg-slate-50">
                      <h4 className="font-semibold text-gray-800 mb-2 text-sm">{category} Staff ({staff.length})</h4>
                      <div className="space-y-1 text-xs">
                        {staff.map((s) => (
                          <div key={s.id} className="bg-white p-2 rounded border border-gray-200">
                            <div className="font-medium text-gray-900">{s.full_name}</div>
                            <div className="text-gray-600">{s.employee_id} • {s.department_name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>

              {/* Generate Button */}
              <Button 
                onClick={handleGenerateMemos}
                disabled={isLoading}
                className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                size="lg"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Generate Professional Memos
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Memos Review */}
      {Object.keys(memos).length > 0 && (
        <Card className="border-2 border-indigo-200 bg-indigo-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-indigo-600" />
              Professional Memos Ready
            </CardTitle>
            <CardDescription>Review memos for {Object.keys(memos).length} staff categor{Object.keys(memos).length === 1 ? "y" : "ies"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Memo Selector */}
            <div className="flex gap-2 border-b">
              {Object.keys(memos).map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedMemoCategory(category)}
                  className={`px-4 py-2 font-medium text-sm transition-colors ${
                    selectedMemoCategory === category
                      ? "border-b-2 border-indigo-600 text-indigo-600"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Memo Preview */}
            {selectedMemoCategory && memos[selectedMemoCategory] && (
              <div className="bg-white border rounded-lg p-4 font-mono text-xs whitespace-pre-wrap overflow-auto max-h-80 text-gray-700 leading-relaxed">
                {memos[selectedMemoCategory]}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-between pt-4 border-t">
              <Button 
                onClick={() => handleDownloadMemo(selectedMemoCategory)}
                variant="outline"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download {selectedMemoCategory}
              </Button>
              <Button 
                onClick={handleSubmitMemos}
                disabled={isSubmitting}
                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Submit All Memos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

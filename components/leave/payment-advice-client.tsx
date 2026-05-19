"use client"

import { useState, useMemo, useEffect } from "react"
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

interface HRExecutive {
  id: string
  name?: string
  full_name?: string
  position?: string
  email: string
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
  const [hrExecutives, setHrExecutives] = useState<HRExecutive[]>([])
  const [selectedSigner, setSelectedSigner] = useState<HRExecutive | null>(null)
  const [loadingHrExecutives, setLoadingHrExecutives] = useState(false)

  // Load HR executives on mount
  useEffect(() => {
    const fetchHrExecutives = async () => {
      setLoadingHrExecutives(true)
      try {
        const response = await fetch("/api/leave/hr-executives")
        if (response.ok) {
          const data = await response.json()
          const execs = (data.executives || []).map((exec: any) => ({
            id: exec.id,
            full_name: exec.name || exec.full_name || "Unknown",
            position: exec.role_label || exec.position || "HR Executive",
            email: exec.email,
          }))
          setHrExecutives(execs)
          console.log("[v0] HR Executives loaded:", execs.length)
          // Set default signer as first HR executive
          if (execs.length > 0) {
            setSelectedSigner(execs[0])
            console.log("[v0] Default signer set to:", execs[0].full_name)
          } else {
            console.log("[v0] No HR executives found")
          }
        } else {
          const error = await response.json()
          console.error("[v0] API returned error:", error)
        }
      } catch (err) {
        console.error("[v0] Error fetching HR executives:", err)
      } finally {
        setLoadingHrExecutives(false)
      }
    }
    
    fetchHrExecutives()
  }, [])

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
      const errorMessage = err instanceof Error ? err.message : (err?.message || "Failed to detect staff. Please try again.")
      toast({
        title: "Error",
        description: errorMessage,
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
    if (!selectedSigner) {
      toast({
        title: "Error",
        description: "Please select an HR executive signer first.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/leave/payment-advice/submit-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          memos,
          staffList,
          selectedSigner: {
            id: selectedSigner.id,
            name: selectedSigner.full_name || selectedSigner.name,
            position: selectedSigner.position,
            email: selectedSigner.email,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error("[v0] API error details:", error)
        throw new Error(error.details || error.error || "Failed to submit memos")
      }

      toast({
        title: "Success",
        description: "Payment advice memos have been saved successfully.",
      })

      setMemos({})
      setStaffList([])
      setMemoSummary(null)
    } catch (err: any) {
      console.error("[v0] Error submitting memos:", err)
      toast({
        title: "Error",
        description: err.message || "Failed to submit memos. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Download memo as professional PDF - traditional memo format
  const handleDownloadMemo = async (category: string) => {
    const memo = memos[category]
    if (!memo) return

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      let yPos = 15

      // ============ HEADER - TWO COLUMN LAYOUT ============
      // Left column: Company details
      doc.setFontSize(10)
      doc.setFont(undefined, "bold")
      doc.setTextColor(0, 0, 0)
      doc.text("QUALITY CONTROL COMPANY LTD.", 20, yPos)
      yPos += 5
      doc.setFont(undefined, "normal")
      doc.text("(COCOBOD)", 20, yPos)
      yPos += 4
      doc.text("P. O. BOX M54", 20, yPos)
      yPos += 4
      doc.text("ACCRA", 20, yPos)

      // Right column: MEMORANDUM title and logo
      doc.setFontSize(11)
      doc.setFont(undefined, "bold")
      doc.text("MEMORANDUM", pageWidth - 50, 15)
      
      // Add logo in top right
      try {
        const logoUrl = "/images/qcc-logo.png"
        doc.addImage(logoUrl, "PNG", pageWidth - 32, 18, 20, 20)
      } catch (err) {
        console.log("[v0] Logo not available, skipping")
      }

      // Vertical separator line
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.5)
      doc.line(pageWidth / 2, 12, pageWidth / 2, 40)

      // Horizontal line below header
      yPos = 42
      doc.line(20, yPos, pageWidth - 20, yPos)
      yPos += 8

      // ============ MEMO FIELDS ============
      doc.setFontSize(10)
      doc.setFont(undefined, "normal")

      // Extract month and year
      const [year, month] = selectedMonth.split("-")
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ]
      const monthName = monthNames[parseInt(month) - 1]
      const categoryLabel = category === "Manager" ? "MANAGEMENT" : category === "Senior" ? "SNR." : "JNR."

      // REF. NO and DATE
      doc.setFont(undefined, "normal")
      doc.text("REF. NO: QCC/", 20, yPos)
      doc.text(`DATE: ${format(new Date(), "dd-MMM-yyyy")}`, pageWidth - 50, yPos, { align: "left" })
      yPos += 8

      // TO field
      doc.setFont(undefined, "bold")
      doc.text("TO:", 20, yPos)
      doc.setFont(undefined, "normal")
      doc.text("DEPUTY DIRECTOR, FINANCE", 35, yPos)
      yPos += 6

      // FROM field
      doc.setFont(undefined, "bold")
      doc.text("FROM:", 20, yPos)
      doc.setFont(undefined, "normal")
      doc.text("DEPUTY HUMAN RESOURCE MANAGER", 35, yPos)
      yPos += 6

      // SUBJECT field
      doc.setFont(undefined, "bold")
      doc.text("SUBJECT:", 20, yPos)
      doc.setFont(undefined, "normal")
      const subjectText = `PAYMENT OF LEAVE ALLOWANCE (${categoryLabel} STAFF) – ${monthName.toUpperCase()} ${year}`
      const splitSubject = doc.splitTextToSize(subjectText, pageWidth - 55)
      doc.text(splitSubject[0], 35, yPos)
      if (splitSubject.length > 1) {
        yPos += 5
        doc.text(splitSubject[1], 35, yPos)
      }
      yPos += 10

      // ============ BODY TEXT ============
      doc.setFont(undefined, "normal")
      doc.setFontSize(10)
      const bodyText = `We wish to inform you that the under-listed ${categoryLabel.toLowerCase()} staff are scheduled to proceed on their annual vacation leave in ${monthName} ${year}.`
      const splitBody = doc.splitTextToSize(bodyText, pageWidth - 40)
      splitBody.forEach((line: string) => {
        doc.text(line, 20, yPos)
        yPos += 5
      })
      yPos += 6

      // ============ STAFF TABLE ============
      const staffData = staffByCategory[category] || []
      const tableHeaders = ["NO", "NAME", "S/NO", "POSITION", "DEPARTMENT", "LEAVE DATE"]
      const tableData = staffData.map((staff, index) => [
        (index + 1).toString(),
        staff.full_name || "Unknown",
        staff.employee_id || "N/A",
        staff.position || "N/A",
        staff.department_name || "N/A",
        staff.start_date ? format(new Date(staff.start_date), "dd-MMM-yy") : "N/A",
      ])

      // Table parameters - simple clean layout
      const colWidths = [8, 45, 18, 35, 35, 24]
      const rowHeight = 6
      const headerHeight = 8
      const startX = 15

      // Draw table header - simple black borders, no fill
      doc.setFont(undefined, "bold")
      doc.setFontSize(9)
      doc.setTextColor(0, 0, 0)
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.5)
      
      let xPos = startX
      tableHeaders.forEach((header, i) => {
        doc.rect(xPos, yPos, colWidths[i], headerHeight)
        doc.text(header, xPos + 2, yPos + 5)
        xPos += colWidths[i]
      })
      yPos += headerHeight

      // Draw table data - simple borders
      doc.setFont(undefined, "normal")
      doc.setFontSize(8)
      doc.setTextColor(0, 0, 0)
      tableData.forEach((row) => {
        // Check if we need a new page
        if (yPos + rowHeight > pageHeight - 30) {
          doc.addPage()
          yPos = 20
        }

        xPos = startX
        row.forEach((cell, i) => {
          const colWidth = colWidths[i]
          
          // Handle text wrapping for NAME column (index 1)
          if (i === 1) {
            const wrappedText = doc.splitTextToSize(cell, colWidth - 3)
            const cellHeight = rowHeight * wrappedText.length
            doc.setDrawColor(0, 0, 0)
            doc.setLineWidth(0.3)
            doc.rect(xPos, yPos, colWidth, cellHeight)
            doc.setTextColor(0, 0, 0)
            wrappedText.forEach((line: string, lineIdx: number) => {
              doc.text(line, xPos + 2, yPos + 4 + lineIdx * 4)
            })
            yPos += (wrappedText.length - 1) * 2
          } else {
            doc.setDrawColor(0, 0, 0)
            doc.setLineWidth(0.3)
            doc.rect(xPos, yPos, colWidth, rowHeight)
            doc.setTextColor(0, 0, 0)
            doc.text(cell, xPos + 2, yPos + 4)
          }
          xPos += colWidth
        })
        yPos += rowHeight
      })

      yPos += 8

      // ============ CLOSING TEXT ============
      doc.setFont(undefined, "normal")
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text("We, therefore, kindly request you to pay their leave allowances accordingly.", 20, yPos)
      yPos += 6
      doc.text("We count on your co-operation.", 20, yPos)
      yPos += 12

      // ============ SIGNATURE BLOCK WITH PROPER FORMATTING ============
      yPos += 4
      
      // Signature line (for handwritten signature)
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.5)
      doc.line(20, yPos, 50, yPos)
      yPos += 10
      
      // Signer name
      doc.setFont(undefined, "bold")
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      const signerName = selectedSigner ? selectedSigner.full_name.toUpperCase() : "HR EXECUTIVE"
      doc.text(signerName, 20, yPos)
      yPos += 6
      
      // Signer title
      doc.setFont(undefined, "normal")
      doc.setFontSize(9)
      const signerTitle = selectedSigner ? selectedSigner.position : "DEPUTY HUMAN RESOURCE MANAGER"
      doc.text(signerTitle, 20, yPos)
      yPos += 10

      // ============ CC LIST ============
      // Add horizontal line separator
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.3)
      doc.line(20, yPos, pageWidth - 20, yPos)
      yPos += 6
      
      doc.setFont(undefined, "bold")
      doc.setFontSize(9)
      doc.setTextColor(0, 0, 0)
      doc.text("cc:", 20, yPos)
      yPos += 5
      
      doc.setFont(undefined, "normal")
      doc.setFontSize(8)
      
      const ccList = ["Managing Director", "Deputy Director, HR", "Audit Manager"]
      ccList.forEach((cc) => {
        doc.text(cc, 25, yPos)
        yPos += 4
      })

      // Save the PDF
      doc.save(`payment-advice-${category}-${selectedMonth}.pdf`)

      // Send notifications to all staff in this category for this month
      const staffIds = staffData.map((staff) => staff.user_id).filter(Boolean)
      if (staffIds.length > 0) {
        try {
          await fetch("/api/leave/payment-advice-notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              staffIds,
              month: selectedMonth,
              category,
            }),
          })
          console.log(`[v0] Notifications sent to ${staffIds.length} staff members`)
        } catch (err) {
          console.error("[v0] Error sending notifications:", err)
        }
      }

      toast({
        title: "Success",
        description: `Payment advice memo downloaded and notifications sent to ${staffData.length} staff member(s).`,
      })
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
      {/* Month Selection & HR Signer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Select Month & Signer for Payment Advice
          </CardTitle>
          <CardDescription>Generate professional payment advice memos for annual leave</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
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
            <div>
              <Label htmlFor="signer-select" className="mb-2 block font-medium">
                HR Executive (Signer)
              </Label>
              <select
                id="signer-select"
                value={selectedSigner?.id || ""}
                onChange={(e) => {
                  const signer = hrExecutives.find((exec) => exec.id === e.target.value)
                  if (signer) setSelectedSigner(signer)
                }}
                disabled={loadingHrExecutives || hrExecutives.length === 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
              >
                <option value="">
                  {loadingHrExecutives ? "Loading..." : "Select HR Executive"}
                </option>
                {hrExecutives.map((exec) => (
                  <option key={exec.id} value={exec.id}>
                    {exec.full_name} ({exec.position})
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="flex-1">
              {selectedSigner && (
                <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  <div className="font-medium text-gray-900">{selectedSigner.full_name}</div>
                  <div className="text-xs text-gray-600">{selectedSigner.position}</div>
                </div>
              )}
            </div>
            <Button 
              onClick={handleDetectStaff} 
              disabled={isLoading || !selectedSigner} 
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

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

  // Download memo as professional PDF
  const handleDownloadMemo = (category: string) => {
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
      let yPos = 10

      // ============ LOGO AND LETTERHEAD ============
      try {
        // Add company logo - centered, larger and more prominent
        const logoUrl = "/images/qcc-logo.png"
        doc.addImage(logoUrl, "PNG", pageWidth / 2 - 12, 8, 24, 24)
      } catch (err) {
        console.log("[v0] Logo not available, skipping")
      }

      // Add decorative line below logo
      doc.setDrawColor(139, 109, 50) // Brown/gold color
      doc.setLineWidth(0.8)
      doc.line(20, 35, pageWidth - 20, 35)

      // Company info - centered, modern style
      doc.setFontSize(12)
      doc.setFont(undefined, "bold")
      doc.text("QUALITY CONTROL COMPANY LTD.", pageWidth / 2, 40, { align: "center" })

      doc.setFontSize(10)
      doc.setFont(undefined, "normal")
      doc.text("(COCOBOD) • P.O. BOX M54 • ACCRA", pageWidth / 2, 45, { align: "center" })

      // Add "MEMORANDUM" in modern style
      doc.setFontSize(16)
      doc.setFont(undefined, "bold")
      doc.setTextColor(51, 65, 85) // Dark blue-gray
      doc.text("MEMORANDUM", pageWidth / 2, 55, { align: "center" })

      yPos = 65

      // ============ MEMO HEADER ============
      doc.setFontSize(10)
      doc.setFont(undefined, "normal")
      doc.setTextColor(0, 0, 0) // Reset to black

      // Extract month and year from selectedMonth (format: YYYY-MM)
      const [year, month] = selectedMonth.split("-")
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ]
      const monthName = monthNames[parseInt(month) - 1]

      // Modern two-column header
      // Modern TO, FROM, SUBJECT section
      doc.setFontSize(10)
      doc.setFont(undefined, "bold")
      doc.setTextColor(139, 109, 50) // Brown/gold color for labels
      doc.text("TO:", 20, yPos)
      doc.setFont(undefined, "normal")
      doc.setTextColor(0, 0, 0)
      doc.text("DEPUTY DIRECTOR, FINANCE", 32, yPos)
      yPos += 8

      doc.setFont(undefined, "bold")
      doc.setTextColor(139, 109, 50)
      doc.text("FROM:", 20, yPos)
      doc.setFont(undefined, "normal")
      doc.setTextColor(0, 0, 0)
      doc.text("DEPUTY HUMAN RESOURCE MANAGER", 32, yPos)
      yPos += 10

      // Subject line with background
      doc.setFont(undefined, "bold")
      doc.setTextColor(139, 109, 50)
      doc.text("SUBJECT:", 20, yPos)
      const categoryLabel = category === "Manager" ? "MANAGEMENT" : category === "Senior" ? "SNR." : "JNR."
      doc.setTextColor(0, 0, 0)
      const subjectText = `PAYMENT OF LEAVE ALLOWANCE (${categoryLabel} STAFF) – ${monthName.toUpperCase()} ${year}`
      const subjectWidth = doc.getStringUnitWidth(subjectText) * 10 / doc.internal.scaleFactor
      doc.rect(32, yPos - 4, Math.min(subjectWidth + 4, pageWidth - 52), 7, "F")
      doc.setTextColor(255, 255, 255) // White text on background
      doc.text(subjectText, 34, yPos, { maxWidth: pageWidth - 54 })
      
      yPos += 12

      // ============ BODY TEXT ============
      doc.setFont(undefined, "normal")
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      const bodyText = `We wish to inform you that the under-listed ${categoryLabel.toLowerCase()} staff are scheduled to proceed on their annual vacation leave in ${monthName} ${year}.`
      const splitBody = doc.splitTextToSize(bodyText, pageWidth - 40)
      splitBody.forEach((line: string) => {
        doc.text(line, 20, yPos)
        yPos += 6
      })
      yPos += 6

      // ============ STAFF TABLE WITH MODERN STYLING ============
      const staffData = staffByCategory[category] || []
      const tableHeaders = ["NO", "NAME", "S/NO", "POSITION", "DEPARTMENT", "LEAVE DATE"]
      const tableData = staffData.map((staff, index) => [
        (index + 1).toString(),
        staff.full_name || "Unknown",
        staff.employee_id || "N/A",
        staff.position || "N/A",
        staff.department_name || "N/A",
        staff.start_date ? format(new Date(staff.start_date), "dd-MM-yy") : "N/A",
      ])

      // Table parameters
      const colWidths = [8, 50, 16, 28, 28, 20]
      const rowHeight = 7
      const headerHeight = 8
      const startX = 15

      // Draw table header with modern styling
      doc.setFont(undefined, "bold")
      doc.setFontSize(9)
      doc.setTextColor(255, 255, 255)
      doc.setFillColor(139, 109, 50) // Brown/gold background
      let xPos = startX
      tableHeaders.forEach((header, i) => {
        doc.rect(xPos, yPos, colWidths[i], headerHeight, "F")
        doc.text(header, xPos + 2, yPos + 5)
        xPos += colWidths[i]
      })
      
      // Add border to header
      doc.setDrawColor(80, 60, 30)
      doc.setLineWidth(0.5)
      xPos = startX
      tableHeaders.forEach((header, i) => {
        doc.rect(xPos, yPos, colWidths[i], headerHeight)
        xPos += colWidths[i]
      })
      
      yPos += headerHeight

      // Draw table data with alternating row colors
      doc.setFont(undefined, "normal")
      doc.setFontSize(8)
      doc.setTextColor(0, 0, 0)
      tableData.forEach((row, rowIdx) => {
        // Check if we need a new page
        if (yPos + rowHeight > pageHeight - 30) {
          doc.addPage()
          yPos = 20
        }

        // Alternate row background color
        if (rowIdx % 2 === 0) {
          doc.setFillColor(245, 242, 238) // Light beige
          xPos = startX
          tableHeaders.forEach((header, i) => {
            doc.rect(xPos, yPos, colWidths[i], rowHeight, "F")
            xPos += colWidths[i]
          })
        }

        // Draw cell borders and text
        xPos = startX
        row.forEach((cell, i) => {
          const colWidth = colWidths[i]
          
          // Handle text wrapping for NAME column (index 1)
          if (i === 1) {
            const wrappedText = doc.splitTextToSize(cell, colWidth - 3)
            doc.setDrawColor(200, 190, 180)
            doc.setLineWidth(0.3)
            doc.rect(xPos, yPos, colWidth, rowHeight * wrappedText.length)
            doc.setTextColor(0, 0, 0)
            wrappedText.forEach((line: string, lineIdx: number) => {
              doc.text(line, xPos + 2, yPos + 4 + lineIdx * 5)
            })
            yPos += (wrappedText.length - 1) * 3
          } else {
            doc.setDrawColor(200, 190, 180)
            doc.setLineWidth(0.3)
            doc.rect(xPos, yPos, colWidth, rowHeight)
            doc.setTextColor(0, 0, 0)
            doc.text(cell, xPos + 2, yPos + 4)
          }
          xPos += colWidth
        })
        yPos += rowHeight
      })

      yPos += 10

      // ============ CLOSING TEXT ============
      doc.setFont(undefined, "normal")
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      const closingText = "We, therefore, kindly request you to pay their leave allowances accordingly."
      doc.text(closingText, 20, yPos)
      yPos += 8

      const cooperationText = "We count on your co-operation."
      doc.text(cooperationText, 20, yPos)
      yPos += 16

      // ============ SIGNATURE BLOCK ============
      // Add signature line
      doc.setDrawColor(80, 60, 30)
      doc.setLineWidth(0.5)
      doc.line(20, yPos, 50, yPos)
      yPos += 6

      doc.setFont(undefined, "bold")
      doc.setFontSize(10)
      doc.setTextColor(51, 65, 85)
      doc.text("FRANK FREDUA-MENSAH (ESQ.)", 20, yPos)
      yPos += 6
      
      doc.setFont(undefined, "normal")
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 80)
      doc.text("DEPUTY HUMAN RESOURCE MANAGER", 20, yPos)
      yPos += 5
      doc.text("FOR: MANAGING DIRECTOR", 20, yPos)
      yPos += 10

      // Add footer divider
      doc.setDrawColor(139, 109, 50)
      doc.setLineWidth(0.8)
      doc.line(20, yPos, pageWidth - 20, yPos)
      yPos += 8

      // ============ CC LIST ============
      doc.setFont(undefined, "bold")
      doc.setFontSize(9)
      doc.setTextColor(139, 109, 50)
      doc.text("cc:", 20, yPos)
      
      doc.setFont(undefined, "normal")
      doc.setFontSize(8)
      doc.setTextColor(80, 80, 80)
      
      const ccList = [
        "Managing Director",
        "Deputy Director, HR",
        "Deputy Director, Finance",
        "Audit Manager",
      ]
      
      let ccIndex = 0
      ccList.forEach((cc, index) => {
        if (index === 0) {
          doc.text(cc, 28, yPos)
        } else if (index === 2) {
          doc.text(cc, 28, yPos + 5)
        } else {
          doc.text(cc, 28, yPos + (index % 2 === 1 ? 5 : 10))
        }
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

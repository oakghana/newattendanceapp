"use client"

import { useState, useMemo, useEffect } from "react"
import { format } from "date-fns"
import { Download, Loader2, FileText, Users, Calendar, Check, CheckCircle, Clock, Filter } from "lucide-react"
import { jsPDF } from "jspdf"
import { generateProfessionalMemoPDF, downloadMemoPDF } from "@/lib/professional-memo-generator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

interface StaffOnLeave {
  // Required for payment memo creation
  leave_plan_request_id: string
  user_id: string
  // Staff details
  id?: string
  full_name: string
  employee_id: string
  staff_number?: string
  department_name: string
  position: string
  category?: string
  staff_category: string
  // Leave details
  start_date?: string
  end_date?: string
  preferred_start_date?: string
  preferred_end_date?: string
  leave_start_date?: string
  leave_end_date?: string
  leave_type: string
  requested_days?: number
  approved_days?: number
}

interface HRExecutive {
  id: string
  name?: string
  full_name?: string
  position?: string
  email: string
}

export function PaymentAdviceClient({ userRole = "hr_leave_office" }: { userRole?: string }) {
  const { toast } = useToast()
  const roleNorm = String(userRole || "").toLowerCase().replace(/[\s-]+/g, "_")
  const isHrLeaveOffice = ["hr_leave_office", "leave_office"].includes(roleNorm)
  // HR Executives who can approve payment advice - include all HR management roles
  const isHrExecutive = ["director_hr", "manager_hr", "hr_director", "hr", "hr_manager", "deputy_hr", "deputy_director_hr", "human_resource_manager", "admin"].includes(roleNorm)
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
  const [referenceNumbers, setReferenceNumbers] = useState<Record<string, string>>({
    Manager: "",
    Senior: "",
    Junior: "",
  })
  const [pendingMemos, setPendingMemos] = useState<any[]>([])
  const [loadingPendingMemos, setLoadingPendingMemos] = useState(false)
  const [approvedMemos, setApprovedMemos] = useState<any[]>([])
  const [loadingApprovedMemos, setLoadingApprovedMemos] = useState(false)
  const [activePaymentTab, setActivePaymentTab] = useState<"pending" | "approved">("pending")
  const [approvedFilterMonth, setApprovedFilterMonth] = useState("")
  const [selectedSignatory, setSelectedSignatory] = useState({
    name: "FRANK FREDUA-MENSAH (ESQ.)",
    title: "DEPUTY HUMAN RESOURCE MANAGER",
  })
  const [customSignatory, setCustomSignatory] = useState("")
  const [customSignatoryTitle, setCustomSignatoryTitle] = useState("")

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
            position: exec.position || "HR EXECUTIVE",
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

  // Load pending memos for HR Executives
  useEffect(() => {
    if (isHrExecutive) {
      const fetchPendingMemos = async () => {
        setLoadingPendingMemos(true)
        try {
          const response = await fetch("/api/leave/payment-advice/pending-approval")
          if (response.ok) {
            const data = await response.json()
            setPendingMemos(data.memos || [])
          } else {
            console.error("[v0] Failed to fetch pending memos")
          }
        } catch (err) {
          console.error("[v0] Error fetching pending memos:", err)
        } finally {
          setLoadingPendingMemos(false)
        }
      }
      fetchPendingMemos()
    }
  }, [isHrExecutive])

  // Load approved memos for tracking/download
  useEffect(() => {
    if (isHrExecutive) {
      const fetchApprovedMemos = async () => {
        setLoadingApprovedMemos(true)
        try {
          const url = approvedFilterMonth
            ? `/api/leave/payment-advice/approved-memos?month=${approvedFilterMonth}`
            : "/api/leave/payment-advice/approved-memos"
          const response = await fetch(url)
          if (response.ok) {
            const data = await response.json()
            setApprovedMemos(data.memos || [])
          } else {
            console.error("[v0] Failed to fetch approved memos")
          }
        } catch (err) {
          console.error("[v0] Error fetching approved memos:", err)
        } finally {
          setLoadingApprovedMemos(false)
        }
      }
      fetchApprovedMemos()
    }
  }, [isHrExecutive, approvedFilterMonth])

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
      console.log("[v0] Detected staff data:", data.staff)
      if (data.staff && data.staff.length > 0) {
        console.log("[v0] First staff member:", data.staff[0])
        console.log("[v0] First staff keys:", Object.keys(data.staff[0]))
      }
      setStaffList(data.staff || [])
      setMemos({})
      setMemoSummary(null)
      // Reset reference numbers when new staff are detected
      setReferenceNumbers({ Manager: "", Senior: "", Junior: "" })

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

    // Validate that all required reference numbers are filled
    const requiredCategories = ["Manager", "Senior", "Junior"].filter(
      (cat) => staffByCategory[cat as keyof typeof staffByCategory]?.length > 0
    )
    
    const missingReferences = requiredCategories.filter(
      (cat) => !referenceNumbers[cat]?.trim()
    )

    if (missingReferences.length > 0) {
      toast({
        title: "Error",
        description: `Please enter reference numbers for: ${missingReferences.join(", ")}`,
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      // Log what we're sending for debugging
      console.log("[v0] Submitting memos data:", {
        month: selectedMonth,
        referenceNumbers,
        staffList: staffList?.length,
        selectedSigner,
        memosKeys: Object.keys(memos),
      })

      // Create a clean payload with only serializable data
      const cleanPayload = {
        month: selectedMonth,
        referenceNumbers,
        memos: memos, // Should be serializable now
        staffList: staffList.map((staff: any) => ({
          leave_plan_request_id: staff.leave_plan_request_id,
          user_id: staff.user_id,
          full_name: staff.full_name,
          staff_number: staff.staff_number,
          employee_id: staff.employee_id,
          position: staff.position,
          department_name: staff.department_name,
          category: staff.category,
          staff_category: staff.staff_category,
          leave_start_date: staff.leave_start_date,
          leave_end_date: staff.leave_end_date,
          preferred_start_date: staff.preferred_start_date,
          preferred_end_date: staff.preferred_end_date,
          leave_type: staff.leave_type,
          requested_days: staff.requested_days,
          approved_days: staff.approved_days,
        })),
        selectedSigner: {
          id: selectedSigner.id,
          name: selectedSigner.full_name || selectedSigner.name,
          position: selectedSigner.position,
          email: selectedSigner.email,
        },
      }

      const response = await fetch("/api/leave/payment-advice/submit-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanPayload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" }))
        console.error("[v0] API error details:", errorData)
        throw new Error(errorData.details || errorData.error || "Failed to submit memos")
      }

      const result = await response.json()
      console.log("[v0] Memo submitted successfully:", result)

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
      
      // Add logo centered between date and memorandum text
      try {
        const logoUrl = "/images/qcc-logo.png"
        // Position logo in the middle, between the right column and edge
        doc.addImage(logoUrl, "PNG", pageWidth - 40, 18, 18, 18)
      } catch (err) {
        console.log("[v0] Logo not available, skipping")
      }

      // Vertical separator line
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.5)
      doc.line(pageWidth / 2, 12, pageWidth / 2, 40)

      // Reference Number and Date (below address, above border line)
      // Generate reference if not provided
      const refNo = referenceNumbers[category]?.trim() || `${category.charAt(0)}-${format(new Date(), "yyyy-MM-dd")}`
      yPos = 36
      doc.setFontSize(9)
      doc.setFont(undefined, "normal")
      doc.text(`REF. NO: ${refNo}`, 20, yPos)
      doc.text(`DATE: ${format(new Date(), "dd-MMM-yyyy")}`, pageWidth - 50, yPos, { align: "left" })

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

      // TO field
      doc.setFont(undefined, "bold")
      doc.text("TO:", 20, yPos)
      doc.setFont(undefined, "normal")
      doc.text("DEPUTY DIRECTOR, FINANCE", 35, yPos)
      yPos += 6

      // FROM field - use selected signer's position
      doc.setFont(undefined, "bold")
      doc.text("FROM:", 20, yPos)
      doc.setFont(undefined, "normal")
      const fromPosition = selectedSigner ? selectedSigner.position.toUpperCase() : "DEPUTY HUMAN RESOURCE MANAGER"
      doc.text(fromPosition, 35, yPos)
      yPos += 6

      // SUBJECT field
      doc.setFont(undefined, "bold")
      const subjectText = `PAYMENT OF LEAVE ALLOWANCE (${categoryLabel} STAFF) – ${monthName.toUpperCase()} ${year}`
      doc.text("SUBJECT: ", 20, yPos)
      
      // Calculate space after SUBJECT:
      const subjectLabelWidth = doc.getTextWidth("SUBJECT: ")
      doc.setFont(undefined, "normal")
      const splitSubject = doc.splitTextToSize(subjectText, pageWidth - 55 - subjectLabelWidth)
      doc.text(splitSubject[0], 20 + subjectLabelWidth, yPos)
      
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
      const tableData = staffData.map((staff, index) => {
        // Try multiple date fields to find a valid leave date
        let leaveDate = "N/A"
        if (staff.leave_start_date) {
          leaveDate = format(new Date(staff.leave_start_date), "dd-MMM-yy")
        } else if (staff.preferred_start_date) {
          leaveDate = format(new Date(staff.preferred_start_date), "dd-MMM-yy")
        } else if (staff.start_date) {
          leaveDate = format(new Date(staff.start_date), "dd-MMM-yy")
        }
        
        return [
          (index + 1).toString(),
          staff.full_name || "Unknown",
          staff.employee_id || staff.staff_number || "",
          staff.position || "",
          staff.department_name || "",
          leaveDate,
        ]
      })

      // Table parameters - simple clean layout
      const colWidths = [8, 45, 18, 35, 35, 24]
      const rowHeight = 6
      const headerHeight = 8
      // Calculate centered position: (pageWidth - totalTableWidth) / 2
      const totalTableWidth = colWidths.reduce((sum, width) => sum + width, 0)
      const startX = (pageWidth - totalTableWidth) / 2

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
      yPos += 5
      
      // Signer name (no border above)
      doc.setFont(undefined, "bold")
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      const signerName = selectedSigner ? selectedSigner.full_name.toUpperCase() : "HR EXECUTIVE"
      doc.text(signerName, 20, yPos)
      yPos += 5
      
      // Signer title (rank/position in UPPERCASE)
      doc.setFont(undefined, "normal")
      doc.setFontSize(9)
      const signerTitle = selectedSigner ? selectedSigner.position.toUpperCase() : "DEPUTY HUMAN RESOURCE MANAGER"
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
      doc.text("CC:", 20, yPos)
      yPos += 5
      
      doc.setFont(undefined, "normal")
      doc.setFontSize(8)
      
      const ccList = ["MANAGING DIRECTOR", "DEPUTY DIRECTOR, HR", "AUDIT MANAGER"]
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

  // Download an approved memo as professional PDF with QCC logo
  const downloadApprovedMemo = async (memo: any) => {
    try {
      const currentDate = new Date()
      const dateStr = `${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`

      // Determine signatory - use custom if provided, otherwise use selected
      const signatoryName = customSignatory || selectedSignatory.name
      const signatoryTitle = customSignatoryTitle || selectedSignatory.title

      // Prepare memo data for professional template
      const memoData = {
        to: "DEPUTY DIRECTOR, FINANCE",
        from: "DEPUTY HUMAN RESOURCE MANAGER",
        subject: `PAYMENT OF LEAVE ALLOWANCE - ${memo.memo_subject || "N/A"}`,
        date: dateStr,
        refNo: "QCC/",
        body: `We wish to inform you that the undermentioned staff member is scheduled to proceed on their annual leave.\n\nWe, therefore, kindly request you to process and pay their leave allowance accordingly.\n\nWe count on your co-operation.`,
        signatory: {
          name: signatoryName,
          title: signatoryTitle,
        },
        ccList: ["Managing Director", "Deputy Director, HR", "Audit Manager"],
        memoType: "payment" as const,
        staffList: [
          {
            no: 1,
            name: memo.staff_name || "N/A",
            employeeId: memo.staff_number || "N/A",
            position: "Staff Position",
            department: "Department",
            leaveDate: memo.leave_period_start ? new Date(memo.leave_period_start).toLocaleDateString() : "N/A",
          },
        ],
      }

      // Generate PDF
      const pdf = await generateProfessionalMemoPDF(memoData, `payment-advice-${memo.staff_name}.pdf`)
      
      // Download
      await downloadMemoPDF(pdf, `payment-advice-${memo.staff_name}-${format(new Date(), "yyyyMMdd")}.pdf`)
      
      toast({ title: "Success", description: "Memo downloaded successfully" })
    } catch (err) {
      console.error("[v0] Error downloading memo:", err)
      toast({ title: "Error", description: "Failed to download memo", variant: "destructive" })
    }
  }

  // HR Executives View - Tabbed: Pending Approval + Approved/Download
  if (isHrExecutive) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-600" />
            Payment Advice Management
          </CardTitle>
          <CardDescription>Review, approve, and download payment advice memos submitted by HR Leave Office</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert className="border-blue-200 bg-blue-50">
              <AlertDescription>
                As an HR Executive, you can approve pending memos and download all approved payment advice for tracking.
              </AlertDescription>
            </Alert>

            {/* Tab buttons */}
            <div className="flex gap-2 border-b pb-2">
              <button
                onClick={() => setActivePaymentTab("pending")}
                className={`flex items-center gap-2 px-4 py-2 rounded-t text-sm font-medium transition-colors ${
                  activePaymentTab === "pending"
                    ? "bg-orange-100 text-orange-800 border-b-2 border-orange-500"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <Clock className="h-4 w-4" />
                Pending Approval
                {pendingMemos.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                    {pendingMemos.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActivePaymentTab("approved")}
                className={`flex items-center gap-2 px-4 py-2 rounded-t text-sm font-medium transition-colors ${
                  activePaymentTab === "approved"
                    ? "bg-green-100 text-green-800 border-b-2 border-green-500"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <CheckCircle className="h-4 w-4" />
                Approved & Download
                {approvedMemos.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
                    {approvedMemos.length}
                  </span>
                )}
              </button>
            </div>

            {/* PENDING TAB */}
            {activePaymentTab === "pending" && (
              <>
                {loadingPendingMemos ? (
                  <div className="flex justify-center py-8">
                    <div className="text-center">
                      <Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto" />
                      <p className="mt-2 text-gray-600 text-sm">Loading pending memos...</p>
                    </div>
                  </div>
                ) : pendingMemos.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
                    <p className="text-lg font-medium">No Pending Memos</p>
                    <p className="text-sm text-gray-400 mt-1">All submitted payment advice memos have been reviewed.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600 font-medium">Pending Memos ({pendingMemos.length})</p>
                    <div className="grid gap-3">
                      {pendingMemos.map((memo) => (
                        <div key={memo.id} className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-semibold text-gray-900">{memo.staff_name}</p>
                              <p className="text-sm text-gray-500">{memo.staff_number}</p>
                            </div>
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded capitalize">
                              {memo.status || "draft"}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-3">{memo.memo_subject}</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3 bg-gray-50 p-2 rounded">
                            <div>
                              <span className="text-gray-500">To be signed by</span>
                              <p className="font-medium">{memo.hr_leave_office_name}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Leave Days</span>
                              <p className="font-medium">{memo.approved_days} days</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Leave Period</span>
                              <p className="font-medium">
                                {memo.leave_period_start ? new Date(memo.leave_period_start).toLocaleDateString() : "N/A"}
                              </p>
                            </div>
                            <div>
                              <span className="text-gray-500">Submitted</span>
                              <p className="font-medium">
                                {memo.created_at ? new Date(memo.created_at).toLocaleDateString() : "N/A"}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  const res = await fetch("/api/leave/payment-advice/pending-approval", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ memoId: memo.id, approved: true }),
                                  })
                                  if (res.ok) {
                                    setPendingMemos((prev) => prev.filter((m) => m.id !== memo.id))
                                    const updated = { ...memo, status: "reviewed_by_hr", updated_at: new Date().toISOString() }
                                    setApprovedMemos((prev) => [updated, ...prev])
                                    toast({ title: "Memo Approved", description: `Payment advice for ${memo.staff_name} has been approved.` })
                                  } else {
                                    toast({ title: "Error", description: "Failed to approve memo.", variant: "destructive" })
                                  }
                                } catch {
                                  toast({ title: "Error", description: "Failed to approve memo.", variant: "destructive" })
                                }
                              }}
                              className="flex-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const res = await fetch("/api/leave/payment-advice/pending-approval", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ memoId: memo.id, approved: false }),
                                  })
                                  if (res.ok) {
                                    setPendingMemos((prev) => prev.filter((m) => m.id !== memo.id))
                                    toast({ title: "Memo Rejected", description: `Payment advice for ${memo.staff_name} has been rejected.` })
                                  } else {
                                    toast({ title: "Error", description: "Failed to reject memo.", variant: "destructive" })
                                  }
                                } catch {
                                  toast({ title: "Error", description: "Failed to reject memo.", variant: "destructive" })
                                }
                              }}
                              className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* APPROVED TAB */}
            {activePaymentTab === "approved" && (
              <>
                {/* Month filter */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <label className="text-sm font-medium text-gray-700">Filter by Month:</label>
                  <input
                    type="month"
                    value={approvedFilterMonth}
                    onChange={(e) => setApprovedFilterMonth(e.target.value)}
                    className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                  {approvedFilterMonth && (
                    <button
                      onClick={() => setApprovedFilterMonth("")}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {loadingApprovedMemos ? (
                  <div className="flex justify-center py-8">
                    <div className="text-center">
                      <Loader2 className="h-6 w-6 animate-spin text-green-500 mx-auto" />
                      <p className="mt-2 text-gray-600 text-sm">Loading approved memos...</p>
                    </div>
                  </div>
                ) : approvedMemos.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-40" />
                    <p className="text-lg font-medium">No Approved Memos</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {approvedFilterMonth ? `No approved memos found for ${approvedFilterMonth}.` : "No payment advice memos have been approved yet."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600 font-medium">
                        Approved Memos ({approvedMemos.length})
                        {approvedFilterMonth && ` — ${approvedFilterMonth}`}
                      </p>
                    </div>
                    <div className="grid gap-3">
                      {approvedMemos.map((memo) => (
                        <div key={memo.id} className="border border-green-200 rounded-lg p-4 bg-green-50 hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-semibold text-gray-900">{memo.staff_name}</p>
                              <p className="text-sm text-gray-500">{memo.staff_number}</p>
                            </div>
                            <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
                              <CheckCircle className="h-3 w-3" /> Approved
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-3">{memo.memo_subject}</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3 bg-white p-2 rounded border border-green-100">
                            <div>
                              <span className="text-gray-500">To be signed by</span>
                              <p className="font-medium">{memo.hr_leave_office_name}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Leave Days</span>
                              <p className="font-medium">{memo.approved_days} days</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Leave Period</span>
                              <p className="font-medium">
                                {memo.leave_period_start ? new Date(memo.leave_period_start).toLocaleDateString() : "N/A"}
                              </p>
                            </div>
                            <div>
                              <span className="text-gray-500">Approved On</span>
                              <p className="font-medium">
                                {memo.updated_at ? new Date(memo.updated_at).toLocaleDateString() : "N/A"}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => downloadApprovedMemo(memo)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-700 text-white text-sm font-medium rounded hover:bg-green-800 transition-colors"
                          >
                            <Download className="h-4 w-4" />
                            Download PDF
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

          </div>
        </CardContent>
      </Card>
    )
  }

  // HR Leave Office View - Create and submit payment advice memos
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            <div>
              <Label htmlFor="signatory-select" className="mb-2 block font-medium">
                Memo To Be Signed By
              </Label>
              <select
                id="signatory-select"
                value={`${selectedSignatory.name}|${selectedSignatory.title}`}
                onChange={(e) => {
                  const [name, title] = e.target.value.split("|")
                  setSelectedSignatory({ name, title })
                  setCustomSignatory("")
                  setCustomSignatoryTitle("")
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
              >
                <option value="FRANK FREDUA-MENSAH (ESQ.)|DEPUTY HUMAN RESOURCE MANAGER">
                  Frank Fredua-Mensah (DHR Manager)
                </option>
                <option value="custom|custom">Custom Signer</option>
              </select>
            </div>
          </div>

          {/* Custom Signatory Fields */}
          {selectedSignatory.name === "custom" && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <Label className="mb-3 block font-medium text-blue-900">Custom Signatory Details</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="custom-signer-name" className="mb-2 block text-sm font-medium">
                    Full Name
                  </Label>
                  <Input
                    id="custom-signer-name"
                    type="text"
                    placeholder="e.g., FRANK FREDUA-MENSAH (ESQ.)"
                    value={customSignatory}
                    onChange={(e) => setCustomSignatory(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="custom-signer-title" className="mb-2 block text-sm font-medium">
                    Title/Position
                  </Label>
                  <Input
                    id="custom-signer-title"
                    type="text"
                    placeholder="e.g., DEPUTY HUMAN RESOURCE MANAGER"
                    value={customSignatoryTitle}
                    onChange={(e) => setCustomSignatoryTitle(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Reference Number Fields - show only for categories with staff */}
          {staffList.length > 0 && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <Label className="mb-3 block font-medium text-gray-700">
                Reference Numbers (by Staff Category)
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {["Manager", "Senior", "Junior"].map((category) => {
                  const count = staffByCategory[category as keyof typeof staffByCategory]?.length || 0
                  if (count === 0) return null
                  
                  return (
                    <div key={category}>
                      <Label htmlFor={`ref-${category}`} className="mb-2 block text-sm font-medium">
                        {category} Staff ({count})
                      </Label>
                      <Input
                        id={`ref-${category}`}
                        type="text"
                        placeholder={`e.g., HR/PA/${category}/2026/07`}
                        value={referenceNumbers[category] || ""}
                        onChange={(e) =>
                          setReferenceNumbers((prev) => ({
                            ...prev,
                            [category]: e.target.value,
                          }))
                        }
                        className="text-sm"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          
          <div className="flex gap-4">
            <div className="flex-1">
              {selectedSigner && (
                <div className="text-sm text-gray-600">
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

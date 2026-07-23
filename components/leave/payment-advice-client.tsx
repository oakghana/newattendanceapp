"use client"

import { useState, useMemo, useEffect } from "react"
import { format } from "date-fns"
import { Download, Loader2, FileText, Users, Calendar, Check, CheckCircle, Clock, Filter, Eye, Info } from "lucide-react"
import { SignatureRequiredDialog } from "@/components/leave/signature-required-dialog"
import { MonthlySummaryTab } from "@/components/leave/monthly-summary-tab"
import { PaymentAdviceViewAllTab } from "@/components/leave/payment-advice-view-all-tab"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { generateProfessionalMemoPDF, downloadMemoPDF } from "@/lib/professional-memo-generator"

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
  rank?: string
  // Location information (beneficiary location)
  location_name?: string
  location_id?: string
  assigned_location_id?: string
  assigned_location_name?: string
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
  role?: string
  signature_image_url?: string | null
}

export function PaymentAdviceClient({ userRole = "hr_leave_office" }: { userRole?: string }) {
  const { toast } = useToast()
  const roleNorm = String(userRole || "").toLowerCase().replace(/[\s-]+/g, "_")
  const isHrLeaveOffice = ["hr_leave_office", "leave_office"].includes(roleNorm)
  // HR Executives who can approve payment advice - include all HR management roles
  const isHrExecutive = ["hr_executive", "director_hr", "manager_hr", "hr_director", "hr", "hr_manager", "deputy_hr", "deputy_director_hr", "human_resource_manager", "admin"].includes(roleNorm)
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [isLoading, setIsLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [staffList, setStaffList] = useState<StaffOnLeave[]>([])
  const [memos, setMemos] = useState<Record<string, string>>({})
  const [activePaymentTab, setActivePaymentTab] = useState<"pending" | "approved" | "view-all">("pending")
  const [memoSummary, setMemoSummary] = useState<any>(null)
  const [selectedMemoCategory, setSelectedMemoCategory] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hrExecutives, setHrExecutives] = useState<HRExecutive[]>([])
  const [selectedSigner, setSelectedSigner] = useState<HRExecutive | null>(null)
  const [selectedSigners, setSelectedSigners] = useState<HRExecutive[]>([]) // Support multiple signers
  const [loadingHrExecutives, setLoadingHrExecutives] = useState(false)
  const [referenceNumbers, setReferenceNumbers] = useState<Record<string, string>>({
    Manager: "",
    Senior: "",
    Junior: "",
  })
  const [pendingMemos, setPendingMemos] = useState<any[]>([])
  const [loadingPendingMemos, setLoadingPendingMemos] = useState(false)
  const [pendingMemosError, setPendingMemosError] = useState<string | null>(null)
  const [isApprovingMemos, setIsApprovingMemos] = useState(false)
  const [approvedMemos, setApprovedMemos] = useState<any[]>([])
  const [loadingApprovedMemos, setLoadingApprovedMemos] = useState(false)
  const [approvedFilterMonth, setApprovedFilterMonth] = useState("")
  const [showSignatureRequiredDialog, setShowSignatureRequiredDialog] = useState(false)
  const [pendingApprovalMemoIds, setPendingApprovalMemoIds] = useState<string[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string } | null>(null)
  
  // Pagination states
  const [pendingPage, setPendingPage] = useState(1)
  const [approvedPage, setApprovedPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  // HR LEAVE_OFFICE: Track submitted memos to prevent duplicates
  const [submittedMemos, setSubmittedMemos] = useState<any[]>([])
  const [loadingSubmittedMemos, setLoadingSubmittedMemos] = useState(false)
  const [summaryMonth, setSummaryMonth] = useState(new Date().toISOString().slice(0, 7))

  // Load submitted memos for Monthly Summary tab
  useEffect(() => {
    if (!isHrLeaveOffice || !summaryMonth) return

    const loadSubmittedMemos = async () => {
      setLoadingSubmittedMemos(true)
      try {
        const response = await fetch(`/api/leave/payment-advice/my-memos?month=${summaryMonth}`)
        if (response.ok) {
          const data = await response.json()
          setSubmittedMemos(data.memos || [])
        } else {
          setSubmittedMemos([])
        }
      } catch {
        setSubmittedMemos([])
      } finally {
        setLoadingSubmittedMemos(false)
      }
    }

    loadSubmittedMemos()
  }, [isHrLeaveOffice, summaryMonth])

  // Helper: Retry approval after signature has been saved
  const retryPendingApproval = async (memoIds: string[]) => {
    // Use the primary signer from the new selectedSigners array
    const primarySigner = selectedSigners && selectedSigners.length > 0 ? selectedSigners[0] : selectedSigner
    
    if (!primarySigner || memoIds.length === 0) return
    try {
      const response = await fetch("/api/leave/payment-advice/approve-secure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoIds,
          selectedSigner: {
            id: primarySigner.id,
            name: primarySigner.full_name || primarySigner.name,
            position: primarySigner.position,
          },
        }),
      })
      const result = await response.json()
      if (response.ok) {
        const approvedIds = new Set(memoIds)
        setPendingMemos((prev) => prev.filter((m) => !approvedIds.has(m.id)))
        setApprovedMemos((prev) => [
          ...pendingMemos
            .filter((m) => approvedIds.has(m.id))
            .map((m) => ({ ...m, status: "reviewed_by_hr", updated_at: new Date().toISOString() })),
          ...prev,
        ])
        toast({ title: "Approved", description: `${memoIds.length} memo${memoIds.length > 1 ? "s" : ""} approved successfully.` })
      } else {
        toast({ title: "Error", description: result.error || "Failed to approve memos.", variant: "destructive" })
      }
    } catch (err) {
      console.error("[v0] Error in retry approval:", err)
      toast({ title: "Error", description: "Failed to approve memos.", variant: "destructive" })
    }
    setPendingApprovalMemoIds([])
  }

  // Helper: Check if signer has a saved signature
  const checkSignerSignature = async (signerId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/user/signature-check/${signerId}`)
      if (res.ok) {
        const data = await res.json()
        return data.hasSignature === true
      }
      return false
    } catch (err) {
      console.error("[v0] Error checking signer signature:", err)
      return false
    }
  }

  // Helper: Check if current user can approve a specific memo
  const canUserApproveMemo = (memo: any): boolean => {
    if (!currentUserId) return false
    const assignedSigners = Array.isArray(memo.assigned_signers) ? memo.assigned_signers : []
    const canApprove = assignedSigners.includes(currentUserId)
    if (!canApprove) {
      return false
    }
    return canApprove
  }

  // Fetch current user first to set as default signer
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch("/api/auth/current-user")
        if (response.ok) {
          const data = await response.json()
          // The endpoint returns { success, user: {...} }
          const user = data.user
          const fullName = user?.first_name && user?.last_name 
            ? `${user.first_name} ${user.last_name}` 
            : user?.first_name || user?.last_name || "User"
          
          setCurrentUser({
            id: user?.id,
            name: fullName,
            email: user?.email,
          })
          // Also track the current user's ID for signer assignment checks
          setCurrentUserId(user?.id || null)
        }
      } catch (err) {
        console.error("[v0] Error fetching current user:", err)
      }
    }
    fetchCurrentUser()
  }, [])

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
            name: exec.name || exec.full_name || "Unknown",
            full_name: exec.name || exec.full_name || "Unknown",
            position: exec.position || "HR EXECUTIVE",
            role: exec.role || "hr_executive",
            email: exec.email,
            signature_image_url: exec.signature_image_url || null,
          }))
          setHrExecutives(execs)
          // Don't auto-select a signer — users must explicitly choose who should sign.
          setSelectedSigners([])
          setSelectedSigner(null)
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
  }, [currentUser])  // Re-run when currentUser is loaded

  // Load pending memos for HR Executives
  useEffect(() => {
    if (isHrExecutive) {
      const fetchPendingMemos = async () => {
        setLoadingPendingMemos(true)
        setPendingMemosError(null)
        try {
          // Use the restricted endpoint that only shows memos assigned to this HR Executive
          const response = await fetch("/api/leave/payment-advice/pending-assigned")
          if (response.ok) {
            const data = await response.json()
            setPendingMemos(data.memos || [])
            if (data.debugMessage && data.debugMessage !== "Loading successful") {
              setPendingMemosError(data.debugMessage)
            }
          } else {
            const errorData = await response.json()
            const errorMsg = errorData.error || response.statusText
            setPendingMemosError(`Error loading memos: ${errorMsg}`)
            console.error("[v0] Failed to fetch pending memos:", errorMsg)
            setPendingMemos([])
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error"
          setPendingMemosError(`Failed to load pending memos: ${errorMsg}`)
          console.error("[v0] Error fetching pending memos:", err)
          setPendingMemos([])
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
            console.error("[v0] Failed to fetch approved memos:", response.status, response.statusText)
            setApprovedMemos([])
          }
        } catch (err) {
          console.error("[v0] Error fetching approved memos:", err)
          setApprovedMemos([])
        } finally {
          setLoadingApprovedMemos(false)
        }
      }
      fetchApprovedMemos()
    }
  }, [isHrExecutive, approvedFilterMonth])

  // Load submitted memos for HR LEAVE_OFFICE users (to prevent duplicate submissions)
  useEffect(() => {
    if (isHrLeaveOffice) {
      const fetchSubmittedMemos = async () => {
        setLoadingSubmittedMemos(true)
        try {
          const url = summaryMonth
            ? `/api/leave/payment-advice/my-memos?month=${summaryMonth}`
            : "/api/leave/payment-advice/my-memos"
          const response = await fetch(url)
          if (response.ok) {
            const data = await response.json()
            setSubmittedMemos(data.memos || [])
          } else {
            console.error("[v0] Failed to fetch submitted memos")
            setSubmittedMemos([])
          }
        } catch (err) {
          console.error("[v0] Error fetching submitted memos:", err)
          setSubmittedMemos([])
        } finally {
          setLoadingSubmittedMemos(false)
        }
      }
      fetchSubmittedMemos()
    }
  }, [isHrLeaveOffice, summaryMonth])

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
          description: data.message || `No staff are scheduled on annual leave for ${selectedMonth}.`,
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
      // CRITICAL: Check if memos already exist for this month
      // This prevents duplicate submissions and guides users to the Monthly Summary tab
      console.log("[v0] Checking for existing memos for month:", selectedMonth)
      const existingMemosResponse = await fetch(`/api/leave/payment-advice/my-memos?month=${selectedMonth}`)
      
      if (existingMemosResponse.ok) {
        const existingData = await existingMemosResponse.json()
        const existingMemoCount = existingData.memos?.length || 0
        
        console.log("[v0] Found existing memos:", existingMemoCount)
        
        // If memos already exist for this month, warn the user
        if (existingMemoCount > 0) {
          const statuses = existingData.memos.map((m: any) => m.status).filter(Boolean)
          const hasSubmitted = statuses.includes("ready_for_review") || statuses.includes("approved")
          
          toast({
            title: "Month Already Processed",
            description: hasSubmitted 
              ? `${existingMemoCount} payment memo(s) already submitted for ${selectedMonth}. Check the Monthly Summary tab to view details or consider a different month.`
              : `${existingMemoCount} draft(s) exist for ${selectedMonth}. Complete these first or select a different month.`,
            variant: "default",
          })
          
          // Don't prevent generation, but make them aware
          // They may still want to generate if these are drafts
          console.log("[v0] User attempting to generate for month with existing memos:", {
            month: selectedMonth,
            count: existingMemoCount,
            statuses,
          })
        }
      }

      const response = await fetch("/api/leave/payment-advice/generate-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          staffList,
          selectedSigner, // Pass the selected HR Executive signer
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
      
      // Store the signer data with signature for later use when submitting
      if (data.signerData) {
        setSelectedSigner(data.signerData)
      }

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
    // FIRST: Validate that we have staff to submit
    if (!staffList || staffList.length === 0) {
      toast({
        title: "No Staff to Submit",
        description: "Please detect staff members on leave for this month before submitting payment requests. Click 'Detect Staff' first.",
        variant: "destructive",
      })
      return
    }

    // Allow either selectedSigner (single) OR selectedSigners (multiple)
    const signersToUse = selectedSigners && selectedSigners.length > 0 ? selectedSigners : (selectedSigner ? [selectedSigner] : [])
    
    if (!signersToUse || signersToUse.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one HR executive signer.",
        variant: "destructive",
      })
      return
    }

    // ONLY HR EXECUTIVES need signatures - not HR LEAVE_OFFICE staff
    // Check each signer's signature
    if (isHrExecutive && signersToUse.length > 0) {
      const signersWithoutSignature: string[] = []
      
      for (const signer of signersToUse) {
        const hasSignature = await checkSignerSignature(signer.id)
        if (!hasSignature) {
          signersWithoutSignature.push(signer.full_name || signer.name || "Unknown")
        }
      }
      
      if (signersWithoutSignature.length > 0) {
        toast({
          title: "Missing Signatures",
          description: `The following signers need to save their signatures before payment memos can be approved: ${signersWithoutSignature.join(", ")}. Please have them visit Settings > My Profile to upload their signatures.`,
          variant: "destructive",
        })
        setShowSignatureRequiredDialog(true)
        return
      }
    }
    // HR LEAVE_OFFICE users skip signature check entirely - they just submit the request

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
      // Validate that all signers have required fields
      const invalidSigners = signersToUse.filter(s => !s.id || !s.email)
      if (invalidSigners.length > 0) {
        toast({
          title: "Invalid Signer Information",
          description: "One or more signers are missing required information (ID or Email). Please refresh and try again.",
          variant: "destructive",
        })
        return
      }

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
          location_name: staff.location_name || null,
          location_id: staff.location_id || null,
          assigned_location_id: staff.assigned_location_id || null,
          assigned_location_name: staff.assigned_location_name || null,
          leave_start_date: staff.leave_start_date,
          leave_end_date: staff.leave_end_date,
          preferred_start_date: staff.preferred_start_date,
          preferred_end_date: staff.preferred_end_date,
          leave_type: staff.leave_type,
          requested_days: staff.requested_days,
          approved_days: staff.approved_days,
        })),
        selectedSigner: signersToUse[0] ? {
          id: signersToUse[0].id || null,
          name: signersToUse[0].full_name || signersToUse[0].name || "Unknown",
          position: signersToUse[0].position || null,
          email: signersToUse[0].email || null,
          signature_image_url: signersToUse[0].signature_image_url || null,
        } : null,
        // NEW: Pass all selected signers to the API for proper assignment
        selectedSigners: signersToUse.map(s => ({
          id: s.id || null,
          name: s.full_name || s.name || "Unknown",
          position: s.position || null,
          email: s.email || null,
          signature_image_url: s.signature_image_url || null,
        })),
      }

      const response = await fetch("/api/leave/payment-advice/submit-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanPayload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" }))
        console.error("[v0] API error details:", errorData)

        // Handle the "already exists" case (409) as an informational message, not a hard error
        if (response.status === 409 || errorData.alreadyExists) {
          toast({
            title: "Memos Already Submitted",
            description:
              errorData.details ||
              `Payment memos for these staff already exist for ${selectedMonth}. They have already been sent to signers for review.`,
          })
          // Clear the form since the work is effectively done
          setMemos({})
          setStaffList([])
          setMemoSummary(null)
          setSelectedSigners([])
          return
        }

        throw new Error(errorData.details || errorData.error || "Failed to submit memos")
      }

      const result = await response.json()
      console.log("[v0] Memo submitted successfully:", result)

      // If some staff were skipped as duplicates but others succeeded, mention it
      const skipped = Array.isArray(result.skippedDuplicates) ? result.skippedDuplicates.length : 0
      toast({
        title: "Success",
        description:
          skipped > 0
            ? `${result.memoCount} memo(s) saved and assigned to ${signersToUse.length} signer(s). ${skipped} staff already had memos and were skipped.`
            : `Payment advice memos have been saved and assigned to ${signersToUse.length} signer(s) successfully.`,
      })

      setMemos({})
      setStaffList([])
      setMemoSummary(null)
      setSelectedSigners([]) // Clear selected signers after submission
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
      const { jsPDF } = await import("jspdf")
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
      doc.setFont("helvetica", "bold")
      doc.setTextColor(0, 0, 0)
      doc.text("QUALITY CONTROL COMPANY LTD.", 20, yPos)
      yPos += 5
      doc.setFont("helvetica", "normal")
      doc.text("(COCOBOD)", 20, yPos)
      yPos += 4
      doc.text("P. O. BOX M54", 20, yPos)
      yPos += 4
      doc.text("ACCRA", 20, yPos)

      // Right column: MEMORANDUM title and logo
      doc.setFontSize(11)
      doc.setFont("helvetica", "bold")
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
      doc.setFont("helvetica", "normal")
      doc.text(`REF. NO: ${refNo}`, 20, yPos)
      doc.text(`DATE: ${format(new Date(), "dd-MMM-yyyy")}`, pageWidth - 50, yPos, { align: "left" })

      // Horizontal line below header
      yPos = 42
      doc.line(20, yPos, pageWidth - 20, yPos)
      yPos += 8

      // ============ MEMO FIELDS ============
      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")

      // Extract month and year
      const [year, month] = selectedMonth.split("-")
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ]
      const monthName = monthNames[parseInt(month) - 1]
      const categoryLabel = category === "Manager" ? "MANAGEMENT" : category === "Senior" ? "SNR." : "JNR."

      // TO field
      doc.setFont("helvetica", "bold")
      doc.text("TO:", 20, yPos)
      doc.setFont("helvetica", "normal")
      doc.text("DEPUTY DIRECTOR, FINANCE", 35, yPos)
      yPos += 6

      // FROM field - use selected signer's position
      doc.setFont("helvetica", "bold")
      doc.text("FROM:", 20, yPos)
      doc.setFont("helvetica", "normal")
      const fromPosition = selectedSigner ? (selectedSigner.position || "HUMAN RESOURCE MANAGER").toUpperCase() : "HUMAN RESOURCE MANAGER"
      doc.text(fromPosition, 35, yPos)
      yPos += 6

      // SUBJECT field
      doc.setFont("helvetica", "bold")
      const subjectText = `PAYMENT OF LEAVE ALLOWANCE (${categoryLabel} STAFF) – ${monthName.toUpperCase()} ${year}`
      doc.text("SUBJECT: ", 20, yPos)
      
      // Calculate space after SUBJECT:
      const subjectLabelWidth = doc.getTextWidth("SUBJECT: ")
      doc.setFont("helvetica", "normal")
      const splitSubject = doc.splitTextToSize(subjectText, pageWidth - 55 - subjectLabelWidth)
      doc.text(splitSubject[0], 20 + subjectLabelWidth, yPos)
      
      if (splitSubject.length > 1) {
        yPos += 5
        doc.text(splitSubject[1], 35, yPos)
      }
      yPos += 10

      // ============ BODY TEXT ============
      doc.setFont("helvetica", "normal")
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
      const tableHeaders = ["NO", "NAME", "S/NO", "POSITION", "DEPARTMENT", "LOCATION", "LEAVE DATE"]
      const tableData = staffData.map((staff, index) => {
        // Try multiple date fields to find a valid leave date (with NaN protection)
        let leaveDate = "N/A"
        const dateFields = [staff.leave_start_date, staff.preferred_start_date, staff.start_date]
        for (const dateField of dateFields) {
          if (dateField && dateField !== "NaN" && dateField !== "NaN-NaN-N") {
            try {
              const parsedDate = new Date(dateField)
              if (!isNaN(parsedDate.getTime())) {
                leaveDate = format(parsedDate, "dd-MMM-yy")
                break
              }
            } catch {
              // Continue to next date field
            }
          }
        }
        
        // Get location name from memo body or staff data
        const locationName = staff.location_name || staff.assigned_location_name || "HQ"
        
        return [
          (index + 1).toString(),
          staff.full_name || "Unknown",
          staff.employee_id || staff.staff_number || "",
          staff.position || "",
          staff.department_name || "",
          locationName,
          leaveDate,
        ]
      })

      // Table parameters - adjusted widths to include location column
      const colWidths = [8, 35, 15, 28, 28, 20, 18]
      const rowHeight = 6
      const headerHeight = 8
      // Calculate centered position: (pageWidth - totalTableWidth) / 2
      const totalTableWidth = colWidths.reduce((sum, width) => sum + width, 0)
      const startX = (pageWidth - totalTableWidth) / 2

      // Draw table header - simple black borders, no fill
      doc.setFont("helvetica", "bold")
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
      doc.setFont("helvetica", "normal")
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
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text("We, therefore, kindly request you to pay their leave allowances accordingly.", 20, yPos)
      yPos += 6
      doc.text("We count on your co-operation.", 20, yPos)
      yPos += 12

      // ============ SIGNATURE BLOCK WITH PROPER FORMATTING ============
      yPos += 4
      
      // Fetch and add signer's signature image if available (for approved memos)
      let signatureAdded = false
      if (selectedSigner && approvedMemos.some(m => m.id)) {
        try {
          // Fetch the signer's signature from their profile
          const sigRes = await fetch(`/api/user/signature/${selectedSigner.id}`)
          if (sigRes.ok) {
            const sigData = await sigRes.json()
            if (sigData.signature_image_url) {
              const sigResponse = await fetch(sigData.signature_image_url)
              if (sigResponse.ok) {
                const sigBlob = await sigResponse.blob()
                const sigUrl = URL.createObjectURL(sigBlob)
                // Add signature image (40mm wide, 15mm high)
                doc.addImage(sigUrl, "PNG", 20, yPos, 40, 12)
                console.log("[v0] Signature image added to approved memo")
                signatureAdded = true
                yPos += 14
                URL.revokeObjectURL(sigUrl)
              }
            }
          }
        } catch (err) {
          console.log("[v0] Could not fetch signature, will show line instead:", err)
        }
      }
      
      // Signature line (for handwritten signature if no image available)
      if (!signatureAdded) {
        doc.setDrawColor(0, 0, 0)
        doc.setLineWidth(0.5)
        doc.line(20, yPos, 50, yPos)
        yPos += 5
      }
      
      // Signer name (no border above)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      const signerName = selectedSigner ? (selectedSigner.full_name || "HR EXECUTIVE").toUpperCase() : "HR EXECUTIVE"
      doc.text(signerName, 20, yPos)
      yPos += 5
      
      // Signer title (rank/position in UPPERCASE)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      const signerTitle = selectedSigner ? (selectedSigner.position || "HUMAN RESOURCE MANAGER").toUpperCase() : "HUMAN RESOURCE MANAGER"
      doc.text(signerTitle, 20, yPos)
      yPos += 10

      // ============ CC LIST ============
      // Add horizontal line separator
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.3)
      doc.line(20, yPos, pageWidth - 20, yPos)
      yPos += 6
      
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9)
      doc.setTextColor(0, 0, 0)
      doc.text("CC:", 20, yPos)
      yPos += 5
      
      doc.setFont("helvetica", "normal")
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

  // Download an approved memo using server-side API for professional rendering with real signatures
  const downloadApprovedMemo = async (memo: any) => {
    try {
      // Payment advice letters use the dedicated payment-advice/download route
      // (not the leave approval memo route which has a THRO field)
      // This route provides:
      // - TO: DEPUTY DIRECTOR, FINANCE
      // - FROM: HR Executive
      // - No THRO routing (payment advice goes direct)
      // - Professional jsPDF rendering with proper signatures
      
      const memoId = memo.id || memo.leave_plan_request_id
      if (!memoId) {
        toast({ title: "Error", description: "No memo ID found", variant: "destructive" })
        return
      }

      // Open the payment advice download route (no THRO, direct to Finance)
      window.open(`/api/leave/payment-advice/download?memo_id=${memoId}`, "_blank")
      
      toast({ title: "Success", description: "Payment advice downloading..." })
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
              <button
                onClick={() => setActivePaymentTab("view-all")}
                className={`flex items-center gap-2 px-4 py-2 rounded-t text-sm font-medium transition-colors ${
                  activePaymentTab === "view-all"
                    ? "bg-blue-100 text-blue-800 border-b-2 border-blue-500"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <Eye className="h-4 w-4" />
                View All Requests
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
                ) : pendingMemosError ? (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex gap-3">
                      <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-900">Loading Information</p>
                        <p className="text-sm text-blue-700 mt-1">{pendingMemosError}</p>
                        <p className="text-xs text-blue-600 mt-2">Verify that memos have been created and assigned to you in the Payment Advice section.</p>
                      </div>
                    </div>
                  </div>
                ) : pendingMemos.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
                    <p className="text-lg font-medium">No Pending Memos</p>
                    <p className="text-sm text-gray-400 mt-1">All submitted payment advice memos have been reviewed.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Group memos by month and category for batch approval */}
                    {(() => {
                      // Group by month-category key
                      const grouped = pendingMemos.reduce((acc: Record<string, any[]>, memo) => {
                        // Extract month from memo_subject like "Payment of Leave Allowance (Junior Staff) - 2026-07"
                        const subjectMatch = memo.memo_subject?.match(/\(([^)]+)\)\s*-\s*(\d{4}-\d{2})/)
                        const category = subjectMatch?.[1] || "Unknown"
                        const month = subjectMatch?.[2] || "Unknown"
                        const key = `${month}|${category}`
                        if (!acc[key]) acc[key] = []
                        acc[key].push(memo)
                        return acc
                      }, {})

                      // Convert to array and sort by month/category
                      const groupedArray = Object.entries(grouped).map(([key, memos]) => {
                        const [month, category] = key.split("|")
                        return { key, month, category, memos }
                      }).sort((a, b) => b.month.localeCompare(a.month))

                      // Pagination for grouped items
                      const totalPages = Math.ceil(groupedArray.length / ITEMS_PER_PAGE)
                      const startIdx = (pendingPage - 1) * ITEMS_PER_PAGE
                      const paginatedGroups = groupedArray.slice(startIdx, startIdx + ITEMS_PER_PAGE)

                      return (
                        <>
                          {paginatedGroups.map(({ key, month, category, memos }) => (
                        <Card key={key} className="border-l-4 border-l-orange-500 shadow-sm">
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <Users className="h-5 w-5 text-orange-600" />
                                  {category} - {month}
                                </CardTitle>
                                <CardDescription>{memos.length} staff member{memos.length > 1 ? "s" : ""} pending approval</CardDescription>
                              </div>
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                                Ready for Review
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            {/* Staff list in compact table */}
                            <div className="mb-4 rounded-lg border overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Name</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Staff No.</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Rank</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Department</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Location</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Leave Days</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Leave Period</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {memos.map((memo, idx) => {
                                    // Parse memo_body to extract staff rank and location
                                    let memoBody: any = {}
                                    try {
                                      memoBody = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : (memo.memo_body || {})
                                    } catch {
                                      memoBody = {}
                                    }
                                    const staffRank = memoBody.staff_rank_label || category
                                    const staffLocation = memoBody.staff_location_name
                                      || memoBody.staffList?.[0]?.location_name
                                      || memoBody.staffList?.[0]?.assigned_location_name
                                      || memoBody.location_name
                                      || memoBody.staff_department
                                      || "N/A"
                                    const staffDepartment = memoBody.staff_department || "N/A"
                                    
                                    return (
                                      <tr key={memo.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                        <td className="px-3 py-2 font-medium text-gray-900">{memo.staff_name}</td>
                                        <td className="px-3 py-2 text-gray-600">{memo.staff_number}</td>
                                        <td className="px-3 py-2 text-gray-600">{staffRank}</td>
                                        <td className="px-3 py-2 text-gray-600">{staffDepartment}</td>
                                        <td className="px-3 py-2 text-gray-600 font-medium text-blue-600">{staffLocation}</td>
                                        <td className="px-3 py-2 text-gray-600">{memo.approved_days} days</td>
                                        <td className="px-3 py-2 text-gray-600">
                                          {memo.leave_period_start && memo.leave_period_start !== "NaN-NaN-N" && !isNaN(new Date(memo.leave_period_start).getTime())
                                            ? new Date(memo.leave_period_start).toLocaleDateString("en-GB", {
                                                day: "2-digit",
                                                month: "short",
                                                year: "numeric",
                                              })
                                            : "N/A"}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {/* Batch approval buttons */}
                            <div className="flex gap-3">
                              <Button
                                disabled={isApprovingMemos || memos.length === 0}
                                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                onClick={async () => {
                                  setIsApprovingMemos(true)
                                  try {
                                    // Call the server directly — it validates auth, role, and signature server-side.
                                    // No client-side pre-check: currentUser may still be loading when clicked.
                                    const memoIds = memos.map((m) => m.id)
                                    const response = await fetch("/api/leave/payment-advice/approve-secure", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ memoIds }),
                                    })

                                    const result = await response.json()

                                    if (response.ok) {
                                      const approvedNow = new Date().toISOString()
                                      const approvedIds = new Set(memos.map((m) => m.id))
                                      setPendingMemos((prev) => prev.filter((m) => !approvedIds.has(m.id)))
                                      const approvedMemosList = memos.map((m) => ({
                                        ...m,
                                        status: "reviewed_by_hr",
                                        updated_at: approvedNow,
                                      }))
                                      setApprovedMemos((prev) => [...approvedMemosList, ...prev])
                                      toast({
                                        title: "Approved",
                                        description: `${memos.length} memo${memos.length > 1 ? "s" : ""} for ${category} (${month}) approved successfully.`,
                                      })
                                      setActivePaymentTab("approved")
                                    } else {
                                      const errorData = result as any
                                      // Server says signature is missing — show the dialog
                                      if (response.status === 400 && errorData.requiresSignatureSave) {
                                        const ids = memos.map((m: any) => m.id)
                                        setPendingApprovalMemoIds(ids)
                                        setShowSignatureRequiredDialog(true)
                                      } else if (response.status === 403) {
                                        toast({ title: "Access Denied", description: errorData.details || "You are not authorized to approve these memos.", variant: "destructive" })
                                      } else {
                                        toast({ title: "Approval Failed", description: errorData.error || errorData.details || "Failed to approve memos.", variant: "destructive" })
                                      }
                                    }
                                  } catch {
                                    toast({ title: "Error", description: "A network error occurred. Please try again.", variant: "destructive" })
                                  } finally {
                                    setIsApprovingMemos(false)
                                  }
                                }}
                              >
                                {isApprovingMemos ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                                Approve All ({memos.length})
                              </Button>
                              <Button
                                disabled={
                                  isApprovingMemos ||
                                  memos.length === 0 ||
                                  !memos.some((memo) => canUserApproveMemo(memo))
                                }
                                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                onClick={async () => {
                                  try {
                                    // Reject all memos in this group
                                    const promises = memos.map((memo) =>
                                      fetch("/api/leave/payment-advice/pending-approval", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ memoId: memo.id, approved: false }),
                                      })
                                    )
                                    const results = await Promise.all(promises)
                                    const allSuccess = results.every((r) => r.ok)
                                    
                                    if (allSuccess) {
                                      const rejectedIds = new Set(memos.map((m) => m.id))
                                      setPendingMemos((prev) => prev.filter((m) => !rejectedIds.has(m.id)))
                                      toast({
                                        title: "Batch Rejected",
                                        description: `${memos.length} payment advice memo${memos.length > 1 ? "s" : ""} rejected.`,
                                      })
                                    } else {
                                      toast({ title: "Error", description: "Some memos failed to reject.", variant: "destructive" })
                                    }
                                  } catch {
                                    toast({ title: "Error", description: "Failed to reject memos.", variant: "destructive" })
                                  }
                                }}
                              >
                                Reject All
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                          }
                          
                          {/* Pagination for pending memos */}
                          {totalPages > 1 && (
                            <div className="flex justify-between items-center mt-6 px-4 py-3 bg-gray-50 rounded-lg border">
                              <span className="text-sm text-gray-600">
                                Page {pendingPage} of {totalPages} ({groupedArray.length} total groups)
                              </span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                                  disabled={pendingPage === 1}
                                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Previous
                                </button>
                                <button
                                  onClick={() => setPendingPage((p) => Math.min(totalPages, p + 1))}
                                  disabled={pendingPage === totalPages}
                                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
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
                      onClick={() => {
                        setApprovedFilterMonth("")
                        setApprovedPage(1)
                      }}
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
                  <div className="space-y-4">
                    {/* Group approved memos by month and category for batch download */}
                    {(() => {
                      // Group by month-category key
                      const grouped = approvedMemos.reduce((acc: Record<string, any[]>, memo) => {
                        const subjectMatch = memo.memo_subject?.match(/\(([^)]+)\)\s*-\s*(\d{4}-\d{2})/)
                        const category = subjectMatch?.[1] || "Unknown"
                        const month = subjectMatch?.[2] || "Unknown"
                        const key = `${month}|${category}`
                        if (!acc[key]) acc[key] = []
                        acc[key].push(memo)
                        return acc
                      }, {})

                      // Convert to array and sort by month/category
                      const groupedArray = Object.entries(grouped).map(([key, memos]) => {
                        const [month, category] = key.split("|")
                        return { key, month, category, memos }
                      }).sort((a, b) => b.month.localeCompare(a.month))

                      // Filter by selected month if any
                      const filteredGroupedArray = approvedFilterMonth
                        ? groupedArray.filter(({ month }) => month === approvedFilterMonth)
                        : groupedArray

                      // Pagination for approved memos
                      const totalPages = Math.ceil(filteredGroupedArray.length / ITEMS_PER_PAGE)
                      const startIdx = (approvedPage - 1) * ITEMS_PER_PAGE
                      const paginatedGroups = filteredGroupedArray.slice(startIdx, startIdx + ITEMS_PER_PAGE)

                      return (
                        <>
                          {paginatedGroups.map(({ key, month, category, memos }) => (
                        <Card key={key} className="border-l-4 border-l-green-500 shadow-sm">
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                  {category} - {month}
                                </CardTitle>
                                <CardDescription>{memos.length} staff member{memos.length > 1 ? "s" : ""} approved</CardDescription>
                                {/* Signer summary — resolve from each memo's memo_body or signer_name */}
                                {(() => {
                                  // Collect unique signers across all memos in this group
                                  const signerSet = new Map<string, { name: string; position: string }>()
                                  memos.forEach((m) => {
                                    let body: any = {}
                                    try { body = typeof m.memo_body === "string" ? JSON.parse(m.memo_body) : (m.memo_body || {}) } catch {}
                                    const name = (body.approver?.name || m.signer_name || "").trim()
                                    const position = (body.approver?.position || body.selectedSigner?.position || "").trim()
                                    if (name) signerSet.set(name.toUpperCase(), { name: name.toUpperCase(), position })
                                  })
                                  const signers = Array.from(signerSet.values())
                                  if (signers.length === 0) return null
                                  return (
                                    <div className="mt-1.5 flex flex-wrap gap-2">
                                      {signers.map((s) => (
                                        <span key={s.name} className="inline-flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 text-green-800 rounded-full px-2.5 py-0.5 font-medium">
                                          <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                          Signed by: {s.name}{s.position ? ` — ${s.position}` : ""}
                                        </span>
                                      ))}
                                    </div>
                                  )
                                })()}
                              </div>
                              <Badge className="bg-green-100 text-green-800 border-green-300 mt-0.5">
                                ✓ Approved
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            {/* Staff list in compact table */}
                            <div className="mb-4 rounded-lg border overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Name</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Staff No.</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Location</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Rank</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Position</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Leave Days</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Leave Period</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Approved On</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">Signed By</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {memos.map((memo, idx) => {
                                    let memoBody: any = {}
                                    try {
                                      memoBody = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : (memo.memo_body || {})
                                    } catch {
                                      memoBody = {}
                                    }
                                    const staffRank = memoBody.staff_rank_label || category
                                    const staffPosition = memoBody.staff_position || "N/A"
                                    const staffLocation = memoBody.staff_location_name
                                      || memoBody.staffList?.[0]?.location_name
                                      || memoBody.staffList?.[0]?.assigned_location_name
                                      || memoBody.location_name
                                      || (memo as any).assigned_location_name
                                      || memoBody.staff_department
                                      || "N/A"
                                    const signerName = (memoBody.approver?.name || memo.signer_name || "").trim()
                                    
                                    return (
                                      <tr key={memo.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                        <td className="px-3 py-2 font-medium text-gray-900">{memo.staff_name}</td>
                                        <td className="px-3 py-2 text-gray-600">{memo.staff_number}</td>
                                        <td className="px-3 py-2 text-gray-600 text-sm">{staffLocation}</td>
                                        <td className="px-3 py-2 text-gray-600">{staffRank}</td>
                                        <td className="px-3 py-2 text-gray-600">{staffPosition}</td>
                                        <td className="px-3 py-2 text-gray-600">{memo.approved_days} days</td>
                                        <td className="px-3 py-2 text-gray-600">
                                          {memo.leave_period_start ? new Date(memo.leave_period_start).toLocaleDateString() : "N/A"}
                                        </td>
                                        <td className="px-3 py-2 text-gray-600">
                                          {memo.updated_at ? new Date(memo.updated_at).toLocaleDateString() : "N/A"}
                                        </td>
                                        <td className="px-3 py-2">
                                          {signerName ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                              {signerName}
                                            </span>
                                          ) : (
                                            <span className="text-xs text-gray-400">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {/* Batch download button */}
                            <div className="flex gap-3">
                              <Button
                                className="flex-1 bg-green-600 hover:bg-green-700"
                                onClick={async () => {
                                  try {
                                    
                                    // Download combined PDF with all staff in this group
                                    // Use the first memo's selected signer, or fall back to HR Leave Office
                                    let batchSignerName = "HUMAN RESOURCE MANAGER"
                                    let batchSignerTitle = "HUMAN RESOURCE MANAGER"
                                    
                                    // Try to get signer from first memo
                                    if (memos.length > 0) {
                                      let firstMemoBody: any = {}
                                      try {
                                        firstMemoBody = typeof memos[0].memo_body === "string" ? JSON.parse(memos[0].memo_body) : (memos[0].memo_body || {})
                                      } catch {}
                                      
                                      const firstMemoSigner = firstMemoBody.selectedSigner || firstMemoBody.approver || {}
                                      // Prefer the actual signer (set during signing), then the selected signer stored in memo_body
                                      batchSignerName = (memos[0]?.signer_name || firstMemoSigner.name || "HR EXECUTIVE").toUpperCase()
                                      batchSignerTitle = (firstMemoSigner.position || "HUMAN RESOURCE MANAGER").toUpperCase()
                                    }
                                    
                                    const memoData = {
                                      to: "DEPUTY DIRECTOR, FINANCE",
                                      from: batchSignerTitle,
                                      subject: `PAYMENT OF LEAVE ALLOWANCE (${category.toUpperCase()}) – ${
                                        month.includes("-")
                                          ? new Date(month + "-01").toLocaleString("default", { month: "long", year: "numeric" }).toUpperCase()
                                          : month
                                      }`,
                                      date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
                                      // Use the reference number entered by the user during memo creation
                                      refNo: (() => {
                                        // Read the user-entered reference number stored in memo_body
                                        let firstBody: any = {}
                                        try {
                                          firstBody = typeof memos[0]?.memo_body === "string"
                                            ? JSON.parse(memos[0].memo_body)
                                            : (memos[0]?.memo_body || {})
                                        } catch {}
                                        const enteredRef = firstBody?.referenceNumber || firstBody?.reference_number
                                        if (enteredRef && String(enteredRef).trim()) {
                                          return String(enteredRef).trim()
                                        }
                                        // Fallback only if no reference number was entered
                                        const monthDate = month.includes("-") ? new Date(month + "-01") : new Date()
                                        const year = monthDate.getFullYear()
                                        const monthNum = String(monthDate.getMonth() + 1).padStart(2, "0")
                                        const categoryCode = category === "Junior" ? "JNR" : category === "Senior" ? "SNR" : "MGT"
                                        const sequence = String(memos.length).padStart(3, "0")
                                        return `QCC/HR/PA/${year}/${monthNum}/${categoryCode}/${sequence}`
                                      })(),
                                      body: `We wish to inform you that the undermentioned staff members are scheduled to proceed on their annual vacation leave.

We, therefore, kindly request you to process and pay their leave allowance accordingly.

We count on your co-operation.`,
                                      signatory: {
                                        name: batchSignerName,
                                        title: batchSignerTitle,
                                        // Fetch signature from memo_body or direct field - check multiple sources
                                        signature_image_url: (() => {
                                          // First check the top-level signature_data_url (set during signing)
                                          if (memos[0]?.signature_data_url) return memos[0].signature_data_url
                                          // Then check memo_body - signature is stored under selectedSigner.signature_data_url
                                          try {
                                            const body = typeof memos[0]?.memo_body === "string"
                                              ? JSON.parse(memos[0].memo_body)
                                              : memos[0]?.memo_body
                                            return (
                                              body?.selectedSigner?.signature_data_url ||
                                              body?.selectedSigner?.signature_image_url ||
                                              body?.signature_data_url ||
                                              undefined
                                            )
                                          } catch {
                                            return undefined
                                          }
                                        })(),
                                      },
                                      ccList: ["MANAGING DIRECTOR", "DEPUTY DIRECTOR, HR", "AUDIT MANAGER"],
                                      memoType: "payment" as const,
                                      staffList: memos.map((memo, idx) => {
                                        let memoBody: any = {}
                                        try {
                                          memoBody = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : (memo.memo_body || {})
                                        } catch {
                                          memoBody = {}
                                        }
                                        return {
                                          no: idx + 1,
                                          name: memo.staff_name || "N/A",
                                          employeeId: memo.staff_number || "N/A",
                                          position: memoBody.staff_position || "N/A",
                                          department: memoBody.staff_department || "N/A",
                                          leaveDate: memo.leave_period_start
                                            ? new Date(memo.leave_period_start).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                                            : "N/A",
                                        }
                                      }),
                                    }

                                    console.log("[v0] Memo data prepared:", {
                                      signerName: memoData.signatory.name,
                                      signerTitle: memoData.signatory.title,
                                      hasSignature: !!memoData.signatory.signature_image_url,
                                      signaturePreview: memoData.signatory.signature_image_url?.substring(0, 50) + "...",
                                      staffCount: memos.length,
                                    })
                                    const pdfName = `payment-advice-${category.toLowerCase().replace(/\s+/g, "-")}-${month}.pdf`
                                    const memoResult = await generateProfessionalMemoPDF(memoData, pdfName)
                                    console.log("[v0] PDF generated, result type:", typeof memoResult, "has mainPdf:", !!memoResult?.mainPdf)
                                    
                                    await downloadMemoPDF(memoResult, pdfName)

                                    toast({
                                      title: "PDF Downloaded",
                                      description: `Payment advice memo downloaded for ${category} (${month}) with ${memos.length} staff member${memos.length > 1 ? "s" : ""}.`,
                                    })
                                  } catch (error) {
                                    console.error("[v0] Error downloading batch memo:", error)
                                    toast({ title: "Error", description: `Failed to download batch memo: ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" })
                                  }
                                }}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download All ({memos.length})
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                          }
                          
                          {/* Pagination for approved memos */}
                          {totalPages > 1 && (
                            <div className="flex justify-between items-center mt-6 px-4 py-3 bg-gray-50 rounded-lg border">
                              <span className="text-sm text-gray-600">
                                Page {approvedPage} of {totalPages} ({filteredGroupedArray.length} total groups)
                              </span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setApprovedPage((p) => Math.max(1, p - 1))}
                                  disabled={approvedPage === 1}
                                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Previous
                                </button>
                                <button
                                  onClick={() => setApprovedPage((p) => Math.min(totalPages, p + 1))}
                                  disabled={approvedPage === totalPages}
                                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </>
            )}

            {/* VIEW ALL TAB */}
            {activePaymentTab === "view-all" && (
              <PaymentAdviceViewAllTab />
            )}

          </div>
        </CardContent>

        {/* Signature Required Dialog for HR Executives - renders inside HR Executive section */}
        <SignatureRequiredDialog
          open={showSignatureRequiredDialog}
          onOpenChange={setShowSignatureRequiredDialog}
          hrName={selectedSigner?.full_name || selectedSigner?.name || "HR Executive"}
          onSignatureSaved={async () => {
            setShowSignatureRequiredDialog(false)
            // Retry the pending approval now that signature is saved
            if (pendingApprovalMemoIds.length > 0) {
              await retryPendingApproval(pendingApprovalMemoIds)
            }
          }}
        />
      </Card>
    )
  }

  // HR Leave Office View - Create and submit payment advice memos
  return (
    <div className="space-y-6">
      {/* Tabs for HR LEAVE_OFFICE users */}
      {isHrLeaveOffice && (
        <div className="flex gap-2 border-b mb-4">
          <button
            onClick={() => setActivePaymentTab("pending" as any)}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activePaymentTab === "pending" || (activePaymentTab as any) === "pending"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Create Payment Advice
          </button>
          <button
            onClick={() => setActivePaymentTab("approved" as any)}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activePaymentTab === "approved" || (activePaymentTab as any) === "approved"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Monthly Summary ({submittedMemos.length})
          </button>
        </div>
      )}

      {/* Create Payment Advice Tab */}
      {(!isHrLeaveOffice || (activePaymentTab as any) === "pending") && (
      <>
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
              <Label htmlFor="signer-select" className="mb-3 block font-medium">
                Select Signers (Click to Toggle)
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {hrExecutives.map((exec) => {
                  const isSelected = selectedSigners.some((s) => s.id === exec.id)
                  return (
                    <button
                      key={exec.id}
                      onClick={() => {
                        if (isSelected) {
                          // Remove signer
                          const updated = selectedSigners.filter((s) => s.id !== exec.id)
                          setSelectedSigners(updated)
                          if (updated.length > 0) {
                            setSelectedSigner(updated[0])
                          } else {
                            setSelectedSigner(null)
                          }
                        } else {
                          // Add signer - ensure consistent object structure
                          const normalizedSigner: HRExecutive = {
                            id: exec.id,
                            full_name: exec.full_name || exec.name || "Unknown",
                            name: exec.name || exec.full_name || "Unknown",
                            position: exec.position || "HR EXECUTIVE",
                            email: exec.email,
                            role: exec.role,
                            signature_image_url: exec.signature_image_url,
                          }
                          const updated = [...selectedSigners, normalizedSigner]
                          setSelectedSigners(updated)
                          setSelectedSigner(normalizedSigner) // Set as primary signer when added
                        }
                      }}
                      disabled={loadingHrExecutives}
                      className={`px-4 py-3 rounded-lg border-2 font-medium transition-all text-left ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-200"
                          : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{exec.full_name}</div>
                          <div className="text-xs text-gray-600 truncate">{exec.position}</div>
                          <div className="text-xs text-gray-500 truncate">Role: {exec.role || "N/A"}</div>
                          <div className="text-xs text-gray-400 truncate font-mono">ID: {exec.id?.substring(0, 8)}...</div>
                        </div>
                        {isSelected && <CheckCircle className="h-5 w-5 flex-shrink-0 text-blue-500 mt-1" />}
                      </div>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-500 mt-3">Click buttons to select or deselect signers</p>
            </div>
          </div>

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
              {selectedSigners && selectedSigners.length > 0 && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="font-semibold text-blue-900 mb-2">📋 Selected Signers: {selectedSigners.length}</div>
                  <div className="space-y-2">
                    {selectedSigners.map((signer, idx) => (
                      <div key={signer.id} className="text-sm text-blue-800 flex items-start gap-2">
                        <span className="font-medium">{idx === 0 ? "🔵" : "⚪"}</span>
                        <div>
                          <span className="font-medium">{signer.full_name}</span>
                          <span className="text-xs text-blue-600 ml-1">({signer.position})</span>
                          {idx === 0 && <span className="text-xs text-blue-600 ml-2">[PRIMARY]</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(!selectedSigners || selectedSigners.length === 0) && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-sm text-amber-800">⚠️ No signers selected yet. Click signer buttons above to select.</p>
                </div>
              )}
            </div>
            <Button 
              onClick={handleDetectStaff} 
              disabled={isLoading || selectedSigners.length === 0} 
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
      </>
      )}

      {/* Monthly Summary Tab - Redesigned for both HR Leave Office and HR Executive */}
      {(isHrLeaveOffice || isHrExecutive) && activePaymentTab === "approved" && (
        <MonthlySummaryTab />
      )}

      {/* Signature Required Dialog */}
      <SignatureRequiredDialog
        open={showSignatureRequiredDialog}
        onOpenChange={setShowSignatureRequiredDialog}
        hrName={selectedSigner?.full_name || selectedSigner?.name || "HR Executive"}
        onSignatureSaved={() => {
          setShowSignatureRequiredDialog(false)
          // Retry submit after signature is saved
          setTimeout(() => handleSubmitMemos(), 500)
        }}
      />
    </div>
  )
}

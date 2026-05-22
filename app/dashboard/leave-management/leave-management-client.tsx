"use client"

import Link from "next/link"
import { useEffect, useState, useMemo, useCallback } from "react"
import { format } from "date-fns"
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Copy,
  Download,
  FileClock,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react"
import { PaymentAdviceClient } from "@/components/leave/payment-advice-client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { placeholderDescriptions } from "@/lib/leave-templates"

interface LeaveRequest {
  id: string
  user_id: string
  start_date: string
  end_date: string
  reason: string
  leave_type: string
  status: string
  created_at: string
  user_name?: string
  department?: string
  location?: string
  rank?: string
  adjusted_start_date?: string
  adjusted_end_date?: string
  hod_decision?: string
}

interface LeaveNotification {
  id: string
  leave_plan_request_id?: string
  leave_request_id?: string
  user_id?: string
  status: string
  review_decision?: string
  leave_requests: LeaveRequest
  requester_role?: string
  requester_name?: string
  waiting_days?: number
}

interface LeaveManagementClientProps {
  userId: string
  userRole: string
  userDepartment: string | null
  userFirstName: string | null
  userLastName: string | null
  hasHodLinkage: boolean
  inactivityDays: number
  initialStaffRequests: LeaveRequest[]
  initialManagerNotifications: LeaveNotification[]
  initialApprovedStaffRequests?: LeaveRequest[]
}

interface HrMemoTemplate {
  id: string
  template_key: string
  template_name: string
  description: string | null
  subject_template: string
  body_template: string
  cc_recipients: string | null
  is_active: boolean
  updated_at: string | null
  category?: string | null
}

export function LeaveManagementClient({
  userId,
  userRole,
  userDepartment,
  userFirstName,
  userLastName,
  hasHodLinkage,
  inactivityDays,
  initialStaffRequests,
  initialManagerNotifications,
  initialApprovedStaffRequests = [],
}: LeaveManagementClientProps) {
    const formatDateSafe = (value?: string | null) => {
      if (!value) return "-"
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) return "-"
      return format(parsed, "MMM dd, yyyy")
    }

    const pendingStatuses = new Set([
      "pending",
      "pending_hod",
      "pending_hr",
      "pending_manager_review",
      "pending_hod_review",
      "manager_confirmed",
      "hod_approved",
      "hr_office_forwarded",
    ])
    const approvedStatuses = new Set(["approved", "hr_approved"])
    const editableStatuses = new Set([
      "pending",
      "pending_manager_review",
      "manager_changes_requested",
      "manager_rejected",
      "hod_changes_requested",
      "hod_rejected",
      "hr_rejected",
    ])

  const { toast } = useToast()
  const [staffRequests, setStaffRequests] = useState<LeaveRequest[]>(initialStaffRequests)
  const [managerNotifications] = useState<LeaveNotification[]>(initialManagerNotifications)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [, setDismissalReason] = useState("")
  const [editingRequest, setEditingRequest] = useState<LeaveRequest | null>(null)
  const [editStartDate, setEditStartDate] = useState("")
  const [editEndDate, setEditEndDate] = useState("")
  const [editReason, setEditReason] = useState("")
  const [editLeaveType, setEditLeaveType] = useState("")
  const [selectedTab, setSelectedTab] = useState("my-requests")
  const [defermentRequests, setDefermentRequests] = useState<any[]>([])
  const [recallRequests, setRecallRequests] = useState<any[]>([])
  const [myDefermentRequests, setMyDefermentRequests] = useState<any[]>([])
  const [myRecallRequests, setMyRecallRequests] = useState<any[]>([])
  const [isLoadingMyRequests, setIsLoadingMyRequests] = useState(false)
  const [editingDefermentId, setEditingDefermentId] = useState<string | null>(null)
  const [editingRecallId, setEditingRecallId] = useState<string | null>(null)
  const [editDefermentData, setEditDefermentData] = useState<{ deferral_year: string; reason: string }>({ deferral_year: "", reason: "" })
  const [editRecallData, setEditRecallData] = useState<{ recall_date: string; reason: string }>({ recall_date: "", reason: "" })
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isSubmittingDeferment, setIsSubmittingDeferment] = useState(false)
  const [isSubmittingRecall, setIsSubmittingRecall] = useState(false)
  const [selectedApprovedForDeferment, setSelectedApprovedForDeferment] = useState<string | null>(null)
  const [deferralYear, setDeferralYear] = useState<string>("")
  const [defermentReason, setDefermentReason] = useState<string>("")
  const [recallDateInput, setRecallDateInput] = useState<string>("")
  const [recallReasonInput, setRecallReasonInput] = useState<string>("")
  const [selectedApprovedForRecall, setSelectedApprovedForRecall] = useState<string | null>(null)
  const [hrTemplates, setHrTemplates] = useState<HrMemoTemplate[]>([])
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, HrMemoTemplate>>({})
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [savingTemplateKey, setSavingTemplateKey] = useState<string | null>(null)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState("all")
  const [templateActionKey, setTemplateActionKey] = useState<string | null>(null)
  const [showTemplateComposer, setShowTemplateComposer] = useState(false)
  const [showPlaceholderGuide, setShowPlaceholderGuide] = useState(false)
  const [expandedTemplateKey, setExpandedTemplateKey] = useState<string | null>(null)
  const [newTemplate, setNewTemplate] = useState({
    template_key: "",
    template_name: "",
    description: "",
    subject_template: "",
    body_template: "",
    cc_recipients: "",
    category: "approval",
  })
  const [isExportingAnnualLeave, setIsExportingAnnualLeave] = useState(false)
  const [staffApprovedMemos, setStaffApprovedMemos] = useState<any[]>([])
  const [isLoadingApprovedMemos, setIsLoadingApprovedMemos] = useState(false)
  
  // Pagination and search state for Leave Application Actions sections
  const [memosSearchQuery, setMemosSearchQuery] = useState("")
  const [memosCurrentPage, setMemosCurrentPage] = useState(1)
  const memosPageSize = 5
  
  // Filter and paginate approved memos
  const filteredMemos = useMemo(() => {
    if (!memosSearchQuery.trim()) return staffApprovedMemos
    const query = memosSearchQuery.toLowerCase()
    return staffApprovedMemos.filter((memo: any) =>
      (memo.staff_name || "").toLowerCase().includes(query) ||
      (memo.email || "").toLowerCase().includes(query) ||
      (memo.leave_type || "").toLowerCase().includes(query) ||
      (memo.location || "").toLowerCase().includes(query)
    )
  }, [staffApprovedMemos, memosSearchQuery])
  
  const paginatedMemos = useMemo(() => {
    const startIndex = (memosCurrentPage - 1) * memosPageSize
    return filteredMemos.slice(startIndex, startIndex + memosPageSize)
  }, [filteredMemos, memosCurrentPage, memosPageSize])
  
  const memosTotalPages = Math.ceil(filteredMemos.length / memosPageSize)

  const copyTemplate = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast({ title: `${label} copied`, description: "Template copied to clipboard." })
    } catch {
      toast({ title: "Copy failed", description: "Please copy manually.", variant: "destructive" })
    }
  }

  // ─── Export Annual Leave Handler ───
  const exportAnnualLeaveToExcel = async () => {
    try {
      const normalizedRole = String(userRole || "").toLowerCase().replace(/[-\s]+/g, "_")
      const isAuthorized = ["department_head", "regional_manager", "hr_officer", "manager_hr", "director_hr", "hr_director", "admin", "hr_leave_office"].includes(normalizedRole)

      if (!isAuthorized) {
        toast({ title: "Access Denied", description: "Only HOD/RM and HR can export annual leave.", variant: "destructive" })
        return
      }

      setIsExportingAnnualLeave(true)

      const response = await fetch(`/api/leave/export-annual?user_id=${encodeURIComponent(userId)}&user_role=${encodeURIComponent(userRole)}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Export failed")
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `Annual_Leave_Export_${new Date().toISOString().split("T")[0]}.csv`
      document.body.appendChild(link)
      link.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(link)

      toast({ title: "Export Successful", description: "Annual leave data exported to Excel." })
    } catch (error) {
      console.error("[v0] Export error:", error)
      toast({ title: "Export Failed", description: error instanceof Error ? error.message : "Could not export annual leave.", variant: "destructive" })
    } finally {
      setIsExportingAnnualLeave(false)
    }
  }

  // ─── Fetch Approved Memos for HOD/RM Staff ───
  const fetchStaffApprovedMemos = async () => {
    try {
      const normalizedRole = String(userRole || "").toLowerCase().replace(/[-\s]+/g, "_")
      const isAuthorized = ["department_head", "regional_manager", "admin", "hr_officer", "manager_hr", "director_hr", "hr_director", "hr_office", "hr_leave_office"].includes(normalizedRole)

      if (!isAuthorized) return

      setIsLoadingApprovedMemos(true)

      const response = await fetch(`/api/leave/staff-approved-memos?user_id=${encodeURIComponent(userId)}&user_role=${encodeURIComponent(userRole)}&user_department=${encodeURIComponent(userDepartment || "")}`)

      if (!response.ok) {
        throw new Error("Failed to fetch approved memos")
      }

      const data = await response.json()
      setStaffApprovedMemos(data.memos || [])
    } catch (error) {
      console.error("[v0] Fetch approved memos error:", error)
      setStaffApprovedMemos([])
    } finally {
      setIsLoadingApprovedMemos(false)
    }
  }

  const updateTemplateDraft = (templateKey: string, patch: Partial<HrMemoTemplate>) => {
    setTemplateDrafts((prev) => {
      const current = prev[templateKey]
      if (!current) return prev
      return {
        ...prev,
        [templateKey]: {
          ...current,
          ...patch,
        },
      }
    })
  }

  const resetTemplateDraft = (templateKey: string) => {
    const original = hrTemplates.find((t) => t.template_key === templateKey)
    if (!original) return
    setTemplateDrafts((prev) => ({
      ...prev,
      [templateKey]: { ...original },
    }))
  }

  const slugifyTemplateKey = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")

  const handleCreateTemplate = async () => {
    if (!canEditHrTemplates) return

    const payload = {
      ...newTemplate,
      template_key: slugifyTemplateKey(newTemplate.template_key || newTemplate.template_name),
    }

    if (!payload.template_key || !payload.template_name || !payload.subject_template || !payload.body_template) {
      toast({
        title: "Missing template details",
        description: "Template key, name, subject, and body are required.",
        variant: "destructive",
      })
      return
    }

    setCreatingTemplate(true)
    try {
      const response = await fetch("/api/leave/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result?.error || "Failed to create template")
      }

      const created = result.template as HrMemoTemplate
      setHrTemplates((prev) => [...prev, created].sort((a, b) => a.template_name.localeCompare(b.template_name)))
      setTemplateDrafts((prev) => ({ ...prev, [created.template_key]: created }))
      setExpandedTemplateKey(created.template_key)
      setShowTemplateComposer(false)
      setNewTemplate({
        template_key: "",
        template_name: "",
        description: "",
        subject_template: "",
        body_template: "",
        cc_recipients: "",
        category: "approval",
      })
      toast({ title: "Template created", description: `${created.template_name} is ready for use.` })
    } catch (error) {
      toast({
        title: "Create failed",
        description: error instanceof Error ? error.message : "Could not create template",
        variant: "destructive",
      })
    } finally {
      setCreatingTemplate(false)
    }
  }

  const showUnderReviewToast = () => {
    toast({
      title: "Under Review",
      description: "This action is still under review. Thanks for your patience.",
    })
  }

  const handleDeleteAllTestingRecords = async () => {
    if (String(userRole || "") !== "admin") {
      toast({ title: "Forbidden", description: "Only admin can reset the leave system.", variant: "destructive" })
      return
    }

    if (!window.confirm("⚠️ WARNING: This will DELETE ALL leave transactions, requests, planning data, and notifications from the entire system. The leave process will start completely fresh. This action CANNOT be undone. Are you sure?")) {
      return
    }

    setProcessingId("leave-testing-cleanup")
    try {
      const response = await fetch("/api/leave/request", { method: "DELETE" })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result?.error || "Failed to reset leave system")
      }
      toast({ title: "Leave System Reset Complete", description: result?.message || "All leave transactions have been deleted. The system is now fresh." })
      window.location.reload()
    } catch (error) {
      toast({
        title: "Reset failed",
        description: error instanceof Error ? error.message : "Failed to reset leave system.",
        variant: "destructive",
      })
    } finally {
      setProcessingId(null)
    }
  }

  const openEditRequest = (request: LeaveRequest) => {
    setEditingRequest(request)
    setEditStartDate(request.start_date)
    setEditEndDate(request.end_date)
    setEditReason(request.reason || "")
    setEditLeaveType(request.leave_type || "annual")
  }

  const closeEditDialog = () => {
    setEditingRequest(null)
    setEditStartDate("")
    setEditEndDate("")
    setEditReason("")
    setEditLeaveType("")
  }

  const handleUpdateLeaveRequest = async () => {
    if (!editingRequest) return
    if (!editStartDate || !editEndDate || !editLeaveType || !editReason.trim()) {
      toast({ title: "Incomplete update", description: "Start date, end date, leave type, and reason are required.", variant: "destructive" })
      return
    }

    const response = await fetch("/api/leave/planning", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingRequest.id,
        preferred_start_date: editStartDate,
        preferred_end_date: editEndDate,
        reason: editReason,
        leave_type: editLeaveType,
      }),
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (result?.code === "LEAVE_DATE_OVERLAP" && result?.suggested_start_date && result?.suggested_end_date) {
        const useSuggestion = window.confirm(
          `${result.error}\n\nSuggested next available dates: ${result.suggested_start_date} to ${result.suggested_end_date}.\n\nClick OK to use the suggested dates.`,
        )
        if (useSuggestion) {
          setEditStartDate(result.suggested_start_date)
          setEditEndDate(result.suggested_end_date)
        }
      }
      toast({ title: "Update failed", description: result?.error || "Could not edit leave request.", variant: "destructive" })
      return
    }

    setStaffRequests((prev) =>
      prev.map((row) =>
        row.id === editingRequest.id
          ? {
              ...row,
              start_date: editStartDate,
              end_date: editEndDate,
              reason: editReason.trim(),
              leave_type: editLeaveType,
              status: "pending_hod_review",
            }
          : row,
      ),
    )

    toast({ title: "Leave request updated", description: "Your leave request was updated before reviewer action." })
    closeEditDialog()
  }

  const handleApprove = async (notificationId: string) => {
    const normalized = String(userRole || "").toLowerCase().replace(/[\s-]+/g, "_")
    const canManageLeave = ["admin", "department_head", "regional_manager", "hr_officer", "manager_hr", "director_hr", "hr_director", "hr_leave_office"].includes(normalized)
    if (!canManageLeave) {
      showUnderReviewToast()
      return
    }

    const notification = managerNotifications.find((row) => row.id === notificationId)
    const requestId = String(notification?.leave_plan_request_id || notification?.leave_requests?.id || "")
    if (!requestId) {
      toast({ title: "Missing assignment", description: "Leave planning request id was not found.", variant: "destructive" })
      return
    }

    setProcessingId(notificationId)
    try {
      const response = await fetch("/api/leave/planning/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          leave_plan_request_id: requestId,
        }),
      })

      if (response.ok) {
        toast({ title: "Leave approved", description: "Refreshing the view with latest status." })
        window.location.reload()
      } else {
        const result = await response.json().catch(() => ({}))
        throw new Error(result?.error || "Failed to approve leave request")
      }
    } catch (error) {
      console.error("Error approving leave:", error)
      toast({
        title: "Approval failed",
        description: error instanceof Error ? error.message : "Could not approve leave request.",
        variant: "destructive",
      })
    } finally {
      setProcessingId(null)
    }
  }

  const handleDismiss = async (notificationId: string, reason: string) => {
    const normalized = String(userRole || "").toLowerCase().replace(/[\s-]+/g, "_")
    const canManageLeave = ["admin", "department_head", "regional_manager", "hr_officer", "manager_hr", "director_hr", "hr_director", "hr_leave_office"].includes(normalized)
    if (!canManageLeave) {
      showUnderReviewToast()
      return
    }

    if (!String(reason || "").trim()) {
      toast({
        title: "Reason required",
        description: "Please provide a reason before rejecting.",
        variant: "destructive",
      })
      return
    }

    const notification = managerNotifications.find((row) => row.id === notificationId)
    const requestId = String(notification?.leave_plan_request_id || notification?.leave_requests?.id || "")
    if (!requestId) {
      toast({ title: "Missing assignment", description: "Leave planning request id was not found.", variant: "destructive" })
      return
    }

    setProcessingId(notificationId)
    try {
      const response = await fetch("/api/leave/planning/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          leave_plan_request_id: requestId,
          recommendation: reason,
        }),
      })

      if (response.ok) {
        toast({ title: "Request rejected", description: "Refreshing the view with latest status." })
        window.location.reload()
        setDismissalReason("")
      } else {
        const result = await response.json().catch(() => ({}))
        throw new Error(result?.error || "Failed to reject leave request")
      }
    } catch (error) {
      console.error("Error rejecting leave:", error)
      toast({
        title: "Rejection failed",
        description: error instanceof Error ? error.message : "Could not reject leave request.",
        variant: "destructive",
      })
    } finally {
      setProcessingId(null)
    }
  }

  const pendingRequests = useMemo(() => staffRequests.filter((r) => pendingStatuses.has(String(r.status || ""))), [staffRequests])
  const approvedRequests = useMemo(() => {
    // For HOD/RM/HR: use staff's approved leaves for deferment/recall
    const roleNorm = String(userRole || "").toLowerCase().replace(/[\s-]+/g, "_")
    const isManagerRole = ["regional_manager", "department_head", "admin", "hr_officer", "manager_hr", "director_hr", "hr_leave_office", "hr_office", "hr"].includes(roleNorm)
    
    if (isManagerRole && Array.isArray(initialApprovedStaffRequests) && initialApprovedStaffRequests.length > 0) {
      return initialApprovedStaffRequests
    }
    
    // For staff: use their own approved leaves
    return staffRequests.filter((r) => approvedStatuses.has(String(r.status || "")))
  }, [staffRequests, initialApprovedStaffRequests, userRole])
  
  const pendingNotifications = useMemo(() => managerNotifications.filter((n) => String(n.review_decision || "pending") === "pending"), [managerNotifications])
  const adminAllPending = useMemo(() => pendingNotifications, [pendingNotifications])
  const adminStaffQueue = useMemo(() => 
    pendingNotifications.filter((n) => {
      const role = String(n.requester_role || "").toLowerCase()
      return ["staff", "nsp", "intern", "it-admin", "it_admin", "contract"].includes(role)
    }), [pendingNotifications])
  const adminHodQueue = useMemo(() => pendingNotifications.filter((n) => String(n.requester_role || "").toLowerCase() === "department_head"), [pendingNotifications])
  const adminRegionalQueue = useMemo(() => pendingNotifications.filter((n) => String(n.requester_role || "").toLowerCase() === "regional_manager"), [pendingNotifications])
  const adminDelayedQueue = useMemo(() => pendingNotifications.filter((n) => Number(n.waiting_days || 0) >= inactivityDays), [pendingNotifications, inactivityDays])

  const normalizedRole = String(userRole || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
  const canUseStaffLeaveHub = ["staff", "nsp", "intern", "it_admin", "department_head", "regional_manager", "admin", "loan_office", "accounts", "director_hr", "manager_hr", "hr_office", "hr_leave_office", "hr", "audit_staff", "contract", "loan_committee", "committee"].includes(normalizedRole)
  const isManagerView = ["admin", "regional_manager", "department_head", "hr_officer", "manager_hr", "director_hr", "hr_director", "hr_office", "hr_leave_office", "hr"].includes(normalizedRole)
  const isAdminView = normalizedRole === "admin"
  const canViewHrTemplates = ["admin", "hr_director", "hr_leave_office"].includes(normalizedRole)
  const canEditHrTemplates = ["admin", "hr_director", "hr_leave_office"].includes(normalizedRole)
  const isHrLeaveOfficeRole = normalizedRole === "hr_leave_office"
  const isLeaveOfficeRole = ["hr_leave_office", "hr_office", "hr"].includes(normalizedRole)
  const isHrExecutive = ["director_hr", "manager_hr", "hr_director"].includes(normalizedRole)
  const canAccessPaymentAdvice = isHrLeaveOfficeRole || isHrExecutive

  // ─── Deferment Handler ───
  const submitDefermentRequest = async () => {
    try {
      if (!selectedApprovedForDeferment || !deferralYear) {
        toast({ title: "Validation Error", description: "Please select a leave request and deferral year", variant: "destructive" })
        return
      }

      if (!/^\d{4}$/.test(deferralYear)) {
        toast({ title: "Validation Error", description: "Deferral year must be in YYYY format", variant: "destructive" })
        return
      }

      setIsSubmittingDeferment(true)

      const payload = {
        leave_plan_request_id: selectedApprovedForDeferment,
        deferral_year: deferralYear,
        reason: defermentReason || null,
        user_id: userId,
      }

      console.log("[v0] Deferment payload:", payload)

      const response = await fetch("/api/leave/deferment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit deferment request")
      }

      toast({ title: "Success", description: "Deferment request submitted successfully" })
      setSelectedApprovedForDeferment(null)
      setDeferralYear("")
      setDefermentReason("")
    } catch (error) {
      console.error("[v0] Deferment error:", error)
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to submit deferment", variant: "destructive" })
    } finally {
      setIsSubmittingDeferment(false)
    }
  }

  // ─── Recall Handler ───
  const submitRecallRequest = async () => {
    try {
      if (!selectedApprovedForRecall || !recallDateInput) {
        toast({ title: "Validation Error", description: "Please select a leave request and recall date", variant: "destructive" })
        return
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(recallDateInput)) {
        toast({ title: "Validation Error", description: "Recall date must be in YYYY-MM-DD format", variant: "destructive" })
        return
      }

      setIsSubmittingRecall(true)

      const payload = {
        leave_plan_request_id: selectedApprovedForRecall,
        recall_date: recallDateInput,
        reason: recallReasonInput || null,
        user_id: userId,
        user_role: userRole,
      }

      console.log("[v0] Recall payload:", payload)

      const response = await fetch("/api/leave/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit recall request")
      }

      toast({ title: "Success", description: "Recall request submitted successfully" })
      setSelectedApprovedForRecall(null)
      setRecallDateInput("")
      setRecallReasonInput("")
    } catch (error) {
      console.error("[v0] Recall error:", error)
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to submit recall", variant: "destructive" })
    } finally {
      setIsSubmittingRecall(false)
    }
  }

  useEffect(() => {
    const loadTemplates = async () => {
      if (!canViewHrTemplates) return
      setTemplatesLoading(true)
      try {
        const response = await fetch("/api/leave/templates", { cache: "no-store" })
        const result = await response.json().catch(() => ({}))
        
        // Handle case where table doesn't exist or no templates - don't show error
        if (!response.ok) {
          // Only show error for non-404/403 errors (table missing or permission issues are expected states)
          if (response.status !== 404 && response.status !== 403 && response.status !== 500) {
            throw new Error(result?.error || "Failed to load templates")
          }
          // Silently fail for expected cases - templates may not be set up yet
          setHrTemplates([])
          setTemplateDrafts({})
          return
        }

        const rows = Array.isArray(result?.templates) ? (result.templates as HrMemoTemplate[]) : []
        setHrTemplates(rows)
        const nextDrafts: Record<string, HrMemoTemplate> = {}
        rows.forEach((row) => {
          nextDrafts[row.template_key] = { ...row }
        })
        setTemplateDrafts(nextDrafts)
      } catch (error) {
        // Only show toast for unexpected errors, not missing table/permissions
        console.log("[v0] Template loading issue:", error instanceof Error ? error.message : "Unknown error")
        setHrTemplates([])
        setTemplateDrafts({})
      } finally {
        setTemplatesLoading(false)
      }
    }

    void loadTemplates()
  }, [canViewHrTemplates, toast])

  // Fetch approved memos for HOD/RM/HR staff
  useEffect(() => {
    const normalizedRole = String(userRole || "").toLowerCase().replace(/[-\s]+/g, "_")
    const isManagerRole = ["department_head", "regional_manager", "admin", "director_hr", "manager_hr", "hr_officer", "hr_leave_office", "hr_office", "hr"].includes(normalizedRole)
    if (isManagerRole) {
      fetchStaffApprovedMemos()
    }
  }, [userId, userRole, userDepartment])

  // Fetch deferment and recall requests for leave office staff
  useEffect(() => {
    const fetchDefermentAndRecallRequests = async () => {
      const normalizedRole = String(userRole || "").toLowerCase().replace(/[-\s]+/g, "_")
      
      // Only fetch for leave office staff
      if (normalizedRole !== "leave_office") return
      
      try {
        // Fetch pending deferment requests
        const defermentRes = await fetch(`/api/leave/deferment?status=pending&leave_office=${encodeURIComponent(userId)}`, { cache: "no-store" })
        if (defermentRes.ok) {
          const defermentData = await defermentRes.json()
          setDefermentRequests(Array.isArray(defermentData) ? defermentData : defermentData.deferments || [])
        }
        
        // Fetch pending recall requests
        const recallRes = await fetch(`/api/leave/recall?status=pending&leave_office=${encodeURIComponent(userId)}`, { cache: "no-store" })
        if (recallRes.ok) {
          const recallData = await recallRes.json()
          setRecallRequests(Array.isArray(recallData) ? recallData : recallData.recalls || [])
        }
      } catch (error) {
        console.error("[v0] Failed to fetch deferment/recall requests:", error)
      }
    }
    
    void fetchDefermentAndRecallRequests()
  }, [userId, userRole])

  // Fetch user's own recall and deferment requests (for My Requests tab)
  useEffect(() => {
    const fetchMyRecallAndDefermentRequests = async () => {
      if (!userId) return
      setIsLoadingMyRequests(true)
      try {
        // Fetch all user's deferment and recall requests (own requests and initiated requests)
        const res = await fetch(`/api/leave/my-deferment-recall-requests`, { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          // Combine user's own deferment requests with ones they initiated
          const allDeferments = [
            ...(Array.isArray(data.deferment_requests) ? data.deferment_requests : []),
            ...(Array.isArray(data.initiated_deferments) ? data.initiated_deferments : [])
          ]
          setMyDefermentRequests(allDeferments)

          // Combine user's own recall requests with ones they initiated
          const allRecalls = [
            ...(Array.isArray(data.recall_requests) ? data.recall_requests : []),
            ...(Array.isArray(data.initiated_recalls) ? data.initiated_recalls : [])
          ]
          setMyRecallRequests(allRecalls)
        }
      } catch (error) {
        console.error("[v0] Failed to fetch my recall/deferment requests:", error)
      } finally {
        setIsLoadingMyRequests(false)
      }
    }
    
    void fetchMyRecallAndDefermentRequests()
  }, [userId])

  // Determine if a deferment request can be edited (pending or pending_hod_review only)
  const canEditDeferment = (status: string) => ["pending", "pending_hod_review"].includes(status)
  const canEditRecall = (status: string) => ["pending"].includes(status)

  // Start editing a deferment request
  const startEditDeferment = (deferment: any) => {
    setEditingDefermentId(deferment.id)
    setEditDefermentData({
      deferral_year: String(deferment.requested_deferment_year || ""),
      reason: deferment.reason || "",
    })
  }

  // Save edited deferment
  const saveEditDeferment = async () => {
    if (!editingDefermentId) return
    setIsSavingEdit(true)
    try {
      const res = await fetch("/api/leave/deferment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingDefermentId,
          user_id: userId,
          deferral_year: editDefermentData.deferral_year,
          reason: editDefermentData.reason,
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error || "Failed to update deferment")

      // Update local state
      setMyDefermentRequests((prev) =>
        prev.map((d) =>
          d.id === editingDefermentId
            ? { ...d, requested_deferment_year: parseInt(editDefermentData.deferral_year), reason: editDefermentData.reason }
            : d
        )
      )
      setEditingDefermentId(null)
      toast({ title: "Success", description: "Deferment request updated" })
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Update failed", variant: "destructive" })
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Delete deferment request
  const deleteDeferment = async (id: string) => {
    if (!confirm("Are you sure you want to delete this deferment request?")) return
    try {
      const res = await fetch(`/api/leave/deferment?id=${encodeURIComponent(id)}&user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error || "Failed to delete deferment")

      setMyDefermentRequests((prev) => prev.filter((d) => d.id !== id))
      toast({ title: "Success", description: "Deferment request deleted" })
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Delete failed", variant: "destructive" })
    }
  }

  // Start editing a recall request
  const startEditRecall = (recall: any) => {
    setEditingRecallId(recall.id)
    setEditRecallData({
      recall_date: recall.recall_date || "",
      reason: recall.recall_reason || recall.recall_notes || "",
    })
  }

  // Save edited recall
  const saveEditRecall = async () => {
    if (!editingRecallId) return
    setIsSavingEdit(true)
    try {
      const res = await fetch("/api/leave/recall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRecallId,
          user_id: userId,
          recall_date: editRecallData.recall_date,
          reason: editRecallData.reason,
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error || "Failed to update recall")

      setMyRecallRequests((prev) =>
        prev.map((r) =>
          r.id === editingRecallId
            ? { ...r, recall_date: editRecallData.recall_date, recall_reason: editRecallData.reason, recall_notes: editRecallData.reason }
            : r
        )
      )
      setEditingRecallId(null)
      toast({ title: "Success", description: "Recall request updated" })
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Update failed", variant: "destructive" })
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Delete recall request
  const deleteRecall = async (id: string) => {
    if (!confirm("Are you sure you want to delete this recall request?")) return
    try {
      const res = await fetch(`/api/leave/recall?id=${encodeURIComponent(id)}&user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error || "Failed to delete recall")

      setMyRecallRequests((prev) => prev.filter((r) => r.id !== id))
      toast({ title: "Success", description: "Recall request deleted" })
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Delete failed", variant: "destructive" })
    }
  }

  const runTemplateAction = async (templateKey: string, action: "duplicate" | "deactivate" | "activate") => {
    setTemplateActionKey(`${action}:${templateKey}`)
    try {
      const response = await fetch("/api/leave/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_key: templateKey, action }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result?.error || `Failed to ${action} template`)
      }

      const updated = result.template as HrMemoTemplate
      if (action === "duplicate") {
        setHrTemplates((prev) => [...prev, updated].sort((a, b) => a.template_name.localeCompare(b.template_name)))
      } else {
        setHrTemplates((prev) => prev.map((row) => (row.template_key === templateKey ? updated : row)))
      }
      setTemplateDrafts((prev) => ({ ...prev, [updated.template_key]: updated }))
      toast({
        title: action === "duplicate" ? "Template duplicated" : action === "deactivate" ? "Template deactivated" : "Template activated",
        description: updated.template_name,
      })
    } catch (error) {
      toast({
        title: "Template action failed",
        description: error instanceof Error ? error.message : "Could not update template",
        variant: "destructive",
      })
    } finally {
      setTemplateActionKey(null)
    }
  }

  const filteredTemplates = hrTemplates.filter((template) => {
    if (templateCategoryFilter === "all") return true
    return String(template.category || "general") === templateCategoryFilter
  })

  const templateCategoryOptions = [
    "all",
    ...Array.from(new Set(hrTemplates.map((template) => String(template.category || "general")))).sort((a, b) => a.localeCompare(b)),
  ]

  const templateStats = {
    total: hrTemplates.length,
    active: hrTemplates.filter((template) => template.is_active).length,
    inactive: hrTemplates.filter((template) => !template.is_active).length,
  }

  const saveTemplate = async (templateKey: string) => {
    if (!canEditHrTemplates) {
      toast({
        title: "Forbidden",
        description: "Only Director HR, Manager HR, and HR Leave Office can edit templates.",
        variant: "destructive",
      })
      return
    }

    const draft = templateDrafts[templateKey]
    if (!draft) return

    setSavingTemplateKey(templateKey)
    try {
      const response = await fetch("/api/leave/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_key: draft.template_key,
          template_name: draft.template_name,
          description: draft.description,
          subject_template: draft.subject_template,
          body_template: draft.body_template,
          cc_recipients: draft.cc_recipients,
          is_active: draft.is_active,
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result?.error || "Failed to save template")
      }

      const updated = result?.template as HrMemoTemplate
      setHrTemplates((prev) => prev.map((row) => (row.template_key === templateKey ? updated : row)))
      setTemplateDrafts((prev) => ({
        ...prev,
        [templateKey]: updated,
      }))

      toast({
        title: "Template saved",
        description: `${updated.template_name} has been updated for app-wide use.`,
      })
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save template",
        variant: "destructive",
      })
    } finally {
      setSavingTemplateKey(null)
    }
  }

  const renderManagerNotifications = (rows: LeaveNotification[], emptyMessage: string) => {
    if (rows.length === 0) {
      return (
        <Card className="border border-dashed border-slate-300 bg-slate-50/80">
          <CardContent className="py-14 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-slate-400" />
            <p className="font-medium text-slate-700">{emptyMessage}</p>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Leave Type</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">End</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((notification) => {
                  const leave = notification.leave_requests || {
                    id: String(notification.leave_plan_request_id || ""),
                    leave_type: "annual",
                    start_date: null,
                    end_date: null,
                    reason: "",
                  }
                  return (
                    <tr key={notification.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{notification.requester_name || "Staff"}</div>
                        <div className="text-xs text-slate-500">{formatLeaveType(String(notification.requester_role || "staff"))}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{formatLeaveType(String(leave.leave_type || "annual"))}</td>
                      <td className="px-4 py-3">{formatDateSafe(leave.start_date)}</td>
                      <td className="px-4 py-3">{formatDateSafe(leave.end_date)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{formatLeaveType(String(notification.status || "pending"))}</Badge>
                      </td>
                      <td className="max-w-[320px] px-4 py-3 text-xs text-slate-600">{String(leave.reason || "-")}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleApprove(notification.id)}
                            disabled={processingId === notification.id}
                            size="sm"
                            className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                          >
                            {processingId === notification.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Approve
                          </Button>
                          <Button
                            onClick={() => {
                              const rejectReason = window.prompt("Provide rejection reason") || ""
                              if (!rejectReason.trim()) return
                              void handleDismiss(notification.id, rejectReason)
                            }}
                            disabled={processingId === notification.id}
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                          >
                            {processingId === notification.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <Card className="overflow-hidden border-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_28%),linear-gradient(135deg,_#08111f_0%,_#0f2741_48%,_#12355a_100%)] text-white shadow-[0_24px_90px_rgba(8,15,32,0.24)]">
        <CardContent className="p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" /> Leave Workspace
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                      <Calendar className="h-7 w-7 text-cyan-200" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Leave Management</h1>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-200 md:text-base">
                        Review leave activity, track submissions, and move quickly between personal requests and approvals.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge className="border border-white/10 bg-white/10 px-3 py-1 text-cyan-100 hover:bg-white/10">
                    Role: {String(userRole || "staff").replaceAll("_", " ")}
                  </Badge>
                  {userDepartment ? (
                    <Badge className="border border-white/10 bg-white/10 px-3 py-1 text-slate-100 hover:bg-white/10">
                      Department Linked
                    </Badge>
                  ) : null}
                  {canUseStaffLeaveHub ? (
                    <Badge className="border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-emerald-100 hover:bg-emerald-400/10">
                      Self-service Enabled
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <LeaveMetricCard label="Pending" value={String(canUseStaffLeaveHub ? pendingRequests.length : pendingNotifications.length)} hint={canUseStaffLeaveHub ? "Awaiting decision" : "Need review"} tone="blue" icon={<FileClock className="h-4 w-4" />} />
              <LeaveMetricCard label="Approved" value={String(approvedRequests.length)} hint="Confirmed leave" tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />} />
              <LeaveMetricCard label="Submitted" value={String(staffRequests.length)} hint="My requests" tone="cyan" icon={<Calendar className="h-4 w-4" />} />
              <LeaveMetricCard label="Approvals" value={String(pendingNotifications.length)} hint="Manager queue" tone="violet" icon={<ArrowUpRight className="h-4 w-4" />} />
            </div>
          </div>
        </CardContent>
      </Card>

      {canUseStaffLeaveHub && !hasHodLinkage && normalizedRole !== "hr_leave_office" && normalizedRole !== "hr_office" && normalizedRole !== "hr" && (
        <Alert className="border-blue-200 bg-blue-50">
          <AlertDescription className="text-blue-800">
            Your leave profile is not linked to a HOD yet. Kindly inform HR/Admin to complete your HOD linkage so approvals route correctly.
          </AlertDescription>
        </Alert>
      )}

      {/* HR Officer Leave Approval History */}
      {normalizedRole === "hr_officer" && (
        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200 bg-[linear-gradient(135deg,_#fef3ff_0%,_#fefbff_55%,_#faf5ff_100%)] pb-4">
            <div>
              <CardTitle className="text-xl text-slate-900">Leave Approval History</CardTitle>
              <CardDescription className="mt-1 max-w-2xl text-slate-600">
                Review staff leave history, approval details from HOD/Manager, leave types, duration, and remarks for your HR decision.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-600">Loading staff leave approval history...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* HR Memo Templates - Hidden from HR Officer */}
      {canViewHrTemplates && (
        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200 bg-[linear-gradient(135deg,_#eef6ff_0%,_#f8fbff_55%,_#eefaf5_100%)] pb-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle className="text-xl text-slate-900">HR Memo Templates</CardTitle>
                <CardDescription className="mt-1 max-w-2xl text-slate-600">
                  A simpler workspace for HR staff to browse, copy, update, and create leave memo templates without seeing every advanced field at once.
                </CardDescription>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:min-w-[320px]">
                <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Total</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{templateStats.total}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-wide text-emerald-700">Active</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-900">{templateStats.active}</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-wide text-amber-700">Inactive</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-900">{templateStats.inactive}</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quick View</p>
                <p className="mt-1 text-sm text-slate-600">Filter by template purpose and open only the template you want to work on.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {templateCategoryOptions.map((option) => {
                  const active = templateCategoryFilter === option
                  return (
                    <Button
                      key={`template-category-${option}`}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className={active ? "bg-slate-900 hover:bg-slate-800" : "bg-white"}
                      onClick={() => setTemplateCategoryFilter(option)}
                    >
                      {option.replaceAll("_", " ")}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto]">
              {canEditHrTemplates ? (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-between rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                  onClick={() => setShowTemplateComposer((prev) => !prev)}
                >
                  <span>{showTemplateComposer ? "Hide New Template Composer" : "Create New Template"}</span>
                  {showTemplateComposer ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              ) : <div />}

              <Button
                type="button"
                variant="outline"
                className="justify-between rounded-2xl bg-white"
                onClick={() => setShowPlaceholderGuide((prev) => !prev)}
              >
                <span>{showPlaceholderGuide ? "Hide Placeholder Guide" : "Show Placeholder Guide"}</span>
                {showPlaceholderGuide ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>

              <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-900">
                <p className="font-medium">Visible templates</p>
                <p className="mt-1 text-2xl font-semibold">{filteredTemplates.length}</p>
              </div>
            </div>

            {canEditHrTemplates && showTemplateComposer && (
              <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">New Template Composer</p>
                    <p className="mt-1 text-sm text-slate-600">Keep the wording clean and reusable. The key will be normalized automatically.</p>
                  </div>
                  <Badge className="bg-emerald-700 text-white">Simple Create</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Template Name</Label>
                    <Input
                      value={newTemplate.template_name}
                      onChange={(e) => setNewTemplate((prev) => ({
                        ...prev,
                        template_name: e.target.value,
                        template_key: prev.template_key || slugifyTemplateKey(e.target.value),
                      }))}
                      placeholder="Annual Leave Approval Revised"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Template Key</Label>
                    <Input
                      value={newTemplate.template_key}
                      onChange={(e) => setNewTemplate((prev) => ({ ...prev, template_key: slugifyTemplateKey(e.target.value) }))}
                      placeholder="annual_leave_approval_revised"
                    />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Category</Label>
                    <Input
                      value={newTemplate.category}
                      onChange={(e) => setNewTemplate((prev) => ({ ...prev, category: e.target.value.toLowerCase().trim() || "general" }))}
                      placeholder="approval, rejection, deferment"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">CC Recipients</Label>
                    <Input
                      value={newTemplate.cc_recipients}
                      onChange={(e) => setNewTemplate((prev) => ({ ...prev, cc_recipients: e.target.value }))}
                      placeholder="Managing Director, HR Head"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="For use when annual leave requires special management wording"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subject Template</Label>
                  <Input
                    value={newTemplate.subject_template}
                    onChange={(e) => setNewTemplate((prev) => ({ ...prev, subject_template: e.target.value }))}
                    placeholder="APPLICATION FOR {{leave_type}} - {{leave_year_period}}"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Body Template</Label>
                  <Textarea
                    rows={6}
                    value={newTemplate.body_template}
                    onChange={(e) => setNewTemplate((prev) => ({ ...prev, body_template: e.target.value }))}
                    placeholder="We refer to your application dated {{submitted_date}}..."
                    className="text-xs"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowTemplateComposer(false)}>Cancel</Button>
                  <Button onClick={handleCreateTemplate} disabled={creatingTemplate} className="bg-emerald-700 hover:bg-emerald-800">
                    {creatingTemplate ? "Creating..." : "Create Template"}
                  </Button>
                </div>
              </div>
            )}

            {showPlaceholderGuide && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-900">
                  <Info className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">Available Placeholders</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(placeholderDescriptions).map(([key, description]) => (
                    <div key={key} className="rounded-xl border border-amber-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold text-amber-900">{key}</p>
                      <p className="mt-1 text-[11px] text-slate-600">{description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {templatesLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                Loading templates...
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                No templates found for this filter.
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredTemplates.map((template) => {
                  const draft = templateDrafts[template.template_key] || template
                  const isExpanded = expandedTemplateKey === draft.template_key
                  return (
                    <div key={template.template_key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-slate-900">{draft.template_name}</p>
                            <Badge variant={draft.is_active ? "default" : "outline"} className={draft.is_active ? "bg-emerald-600" : ""}>
                              {draft.is_active ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline">{String(draft.category || "general")}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{draft.description || "No description added yet."}</p>
                          <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-500">
                            <span>Key: {draft.template_key}</span>
                            <span>Updated: {draft.updated_at ? format(new Date(draft.updated_at), "dd MMM yyyy, HH:mm") : "Not available"}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyTemplate(`${draft.subject_template}\n\n${draft.body_template}`, `${draft.template_name} template`)}
                          >
                            <Copy className="mr-1 h-4 w-4" /> Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setExpandedTemplateKey((current) => current === draft.template_key ? null : draft.template_key)}
                          >
                            {isExpanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                            {isExpanded ? "Hide Editor" : "Open Editor"}
                          </Button>
                          {canEditHrTemplates && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runTemplateAction(draft.template_key, "duplicate")}
                                disabled={templateActionKey === `duplicate:${draft.template_key}`}
                              >
                                Duplicate
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runTemplateAction(draft.template_key, draft.is_active ? "deactivate" : "activate")}
                                disabled={templateActionKey === `${draft.is_active ? "deactivate" : "activate"}:${draft.template_key}`}
                              >
                                {draft.is_active ? "Deactivate" : "Activate"}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Template Name</Label>
                              <Input
                                value={draft.template_name}
                                onChange={(e) => updateTemplateDraft(draft.template_key, { template_name: e.target.value })}
                                disabled={!canEditHrTemplates}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Category</Label>
                              <Input
                                value={draft.category || "general"}
                                onChange={(e) => updateTemplateDraft(draft.template_key, { category: e.target.value.toLowerCase().trim() || "general" })}
                                disabled={!canEditHrTemplates}
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Description</Label>
                            <Input
                              value={draft.description || ""}
                              onChange={(e) => updateTemplateDraft(draft.template_key, { description: e.target.value })}
                              disabled={!canEditHrTemplates}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Subject Template</Label>
                            <Input
                              value={draft.subject_template}
                              onChange={(e) => updateTemplateDraft(draft.template_key, { subject_template: e.target.value })}
                              disabled={!canEditHrTemplates}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Body Template</Label>
                            <Textarea
                              rows={7}
                              value={draft.body_template}
                              onChange={(e) => updateTemplateDraft(draft.template_key, { body_template: e.target.value })}
                              disabled={!canEditHrTemplates}
                              className="whitespace-pre-wrap text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">CC Recipients</Label>
                            <Input
                              value={draft.cc_recipients || ""}
                              onChange={(e) => updateTemplateDraft(draft.template_key, { cc_recipients: e.target.value })}
                              disabled={!canEditHrTemplates}
                            />
                          </div>

                          {canEditHrTemplates && (
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => resetTemplateDraft(draft.template_key)}>
                                Reset
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => saveTemplate(draft.template_key)}
                                disabled={savingTemplateKey === draft.template_key}
                                className="bg-blue-700 hover:bg-blue-800"
                              >
                                {savingTemplateKey === draft.template_key ? "Saving..." : "Save Changes"}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {String(userRole || "") === "admin" && (
        <Card className="border-red-200 bg-red-50/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-red-900">⚠️ Complete Leave System Reset</CardTitle>
            <CardDescription>Delete ALL leave transactions, requests, and planning data to start the entire leave process from scratch. This action cannot be undone.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleDeleteAllTestingRecords} disabled={processingId === "leave-testing-cleanup"}>
              {processingId === "leave-testing-cleanup" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete All Leave Transactions
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Export Annual Leave Card - HOD/RM/HR Only */}
      {["department_head", "regional_manager", "hr_officer", "manager_hr", "director_hr", "hr_director", "admin"].includes(String(userRole || "").toLowerCase().replace(/[-\s]+/g, "_")) && (
        <Card className="border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-bold text-purple-900 flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Annual Leave Requests
            </CardTitle>
            <CardDescription className="text-purple-700">Download all staff annual leave requests for your department/region as an Excel file</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={exportAnnualLeaveToExcel}
              disabled={isExportingAnnualLeave}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-all"
            >
              {isExportingAnnualLeave ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export to Excel
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STAFF TABS SECTION - Leave Application Actions */}
      <div className="space-y-6">
        <Card className="border border-slate-200 bg-gradient-to-br from-white to-slate-50/50 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-blue-600" />
              Leave Application Actions
            </CardTitle>
            <CardDescription className="text-slate-600">Manage your leave requests and submissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => setSelectedTab("my-requests")}
                className={`gap-2 rounded-xl px-6 py-2 font-semibold transition-all ${
                  selectedTab === "my-requests"
                    ? "bg-blue-600 text-white shadow-md hover:bg-blue-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                }`}
                variant={selectedTab === "my-requests" ? "default" : "outline"}
              >
                <Calendar className="h-4 w-4" />
                My Requests ({staffRequests.length + myDefermentRequests.length + myRecallRequests.length})
              </Button>
              <Button
                asChild
                className="gap-2 rounded-xl px-6 py-2 font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md hover:shadow-lg hover:from-emerald-600 hover:to-emerald-700 transition-all"
              >
                <Link href="/dashboard/leave-planning">
                  <Plus className="h-4 w-4" />
                  Apply for Leave
                </Link>
              </Button>
              <Button
                onClick={() => setSelectedTab("approved")}
                className={`gap-2 rounded-xl px-6 py-2 font-semibold transition-all ${
                  selectedTab === "approved"
                    ? "bg-emerald-600 text-white shadow-md hover:bg-emerald-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                }`}
                variant={selectedTab === "approved" ? "default" : "outline"}
              >
                <CheckCircle2 className="h-4 w-4" />
                Approved ({approvedRequests.length})
              </Button>
              <Button
                onClick={() => setSelectedTab("deferrments")}
                className={`gap-2 rounded-xl px-6 py-2 font-semibold transition-all ${
                  selectedTab === "deferrments"
                    ? "bg-amber-600 text-white shadow-md hover:bg-amber-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                }`}
                variant={selectedTab === "deferrments" ? "default" : "outline"}
              >
                <Calendar className="h-4 w-4" />
                Deferrments
              </Button>
              <Button
                onClick={() => setSelectedTab("recalls")}
                className={`gap-2 rounded-xl px-6 py-2 font-semibold transition-all ${
                  selectedTab === "recalls"
                    ? "bg-rose-600 text-white shadow-md hover:bg-rose-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                }`}
                variant={selectedTab === "recalls" ? "default" : "outline"}
              >
                <ArrowUpRight className="h-4 w-4" />
                Recalls
              </Button>
              {isManagerView && (
                <Button
                  onClick={() => setSelectedTab("approved-memos")}
                  className={`gap-2 rounded-xl px-6 py-2 font-semibold transition-all ${
                    selectedTab === "approved-memos"
                      ? "bg-teal-600 text-white shadow-md hover:bg-teal-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                  }`}
                  variant={selectedTab === "approved-memos" ? "default" : "outline"}
                >
                  <Download className="h-4 w-4" />
                  Approved Memos
                </Button>
              )}
              {canAccessPaymentAdvice && (
                <Button
                  onClick={() => setSelectedTab("payment-advice")}
                  className={`gap-2 rounded-xl px-6 py-2 font-semibold transition-all ${
                    selectedTab === "payment-advice"
                      ? "bg-blue-600 text-white shadow-md hover:bg-blue-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                  }`}
                  variant={selectedTab === "payment-advice" ? "default" : "outline"}
                >
                  <FileText className="h-4 w-4" />
                  Payment Advice
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tab Content */}
        <div className="space-y-4">
          {selectedTab === "my-requests" && (
            <div className="space-y-6">
              {/* Leave Requests Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold text-slate-800">Leave Requests ({staffRequests.length})</h3>
                </div>
                {staffRequests.length === 0 ? (
                  <Card className="border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-blue-50/50">
                    <CardContent className="py-8 text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100/80 mb-3">
                        <Calendar className="h-6 w-6 text-blue-600" />
                      </div>
                      <p className="mb-1 font-medium text-slate-700">No leave requests yet</p>
                      <p className="mb-4 text-sm text-slate-500">Submit a leave request to see it here.</p>
                      <Button
                        asChild
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                      >
                        <Link href="/dashboard/leave-planning">
                          <Plus className="h-4 w-4" />
                          Apply for Leave
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {staffRequests.map((request) => (
                      <LeaveRequestCard key={request.id} request={request} canEdit={editableStatuses.has(String(request.status || ""))} onEdit={() => openEditRequest(request)} toast={toast} />
                    ))}
                  </div>
                )}
              </div>
              
              {/* Recall Requests Section (for HOD/RM who initiated recalls) */}
              {myRecallRequests.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="h-5 w-5 text-rose-600" />
                    <h3 className="font-semibold text-slate-800">My Recall Requests ({myRecallRequests.length})</h3>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {myRecallRequests.map((recall: any) => (
                      <Card key={recall.id} className="border border-rose-200 bg-gradient-to-br from-rose-50/50 to-white hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          {editingRecallId === recall.id ? (
                            // Edit mode
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <Label className="text-xs font-medium text-slate-600">Recall Date</Label>
                                <Input
                                  type="date"
                                  value={editRecallData.recall_date}
                                  onChange={(e) => setEditRecallData((d) => ({ ...d, recall_date: e.target.value }))}
                                  className="text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs font-medium text-slate-600">Reason</Label>
                                <Textarea
                                  value={editRecallData.reason}
                                  onChange={(e) => setEditRecallData((d) => ({ ...d, reason: e.target.value }))}
                                  rows={2}
                                  className="text-sm"
                                />
                              </div>
                              <div className="flex gap-2 pt-2">
                                <Button size="sm" onClick={saveEditRecall} disabled={isSavingEdit} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                  {isSavingEdit ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                  Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingRecallId(null)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            // View mode
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    recall.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                                    recall.status === "rejected" ? "bg-red-100 text-red-700" :
                                    recall.status === "pending" ? "bg-amber-100 text-amber-700" :
                                    "bg-slate-100 text-slate-700"
                                  }`}>
                                    {recall.status === "approved" ? "Approved" :
                                     recall.status === "rejected" ? "Rejected" :
                                     recall.status === "pending" ? "Pending HR Review" :
                                     recall.status || "Pending"}
                                  </span>
                                  {canEditRecall(recall.status) && (
                                    <span className="text-xs text-emerald-600 font-medium">Editable</span>
                                  )}
                                </div>
                                <p className="text-sm text-slate-600 mb-1">
                                  <span className="font-medium">Recall Date:</span> {recall.recall_date ? new Date(recall.recall_date).toLocaleDateString() : "Not set"}
                                </p>
                                <p className="text-sm text-slate-600 mb-1 line-clamp-2">
                                  <span className="font-medium">Reason:</span> {recall.recall_reason || recall.recall_notes || "No reason provided"}
                                </p>
                                <p className="text-xs text-slate-400 mt-2">
                                  Submitted: {recall.created_at ? new Date(recall.created_at).toLocaleDateString() : "Unknown"}
                                </p>
                                {recall.hr_decision_note && (
                                  <p className="text-xs text-slate-600 mt-1 bg-slate-100 p-2 rounded">
                                    <span className="font-medium">HR Note:</span> {recall.hr_decision_note}
                                  </p>
                                )}
                                {/* Edit/Delete buttons for pending recalls */}
                                {canEditRecall(recall.status) && (
                                  <div className="flex gap-2 mt-3 pt-3 border-t border-rose-100">
                                    <Button size="sm" variant="outline" onClick={() => startEditRecall(recall)} className="text-xs">
                                      <Pencil className="h-3 w-3 mr-1" />
                                      Edit
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => deleteRecall(recall.id)} className="text-xs text-red-600 border-red-200 hover:bg-red-50">
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      Delete
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Deferment Requests Section (for users who submitted deferments) */}
              {myDefermentRequests.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileClock className="h-5 w-5 text-amber-600" />
                    <h3 className="font-semibold text-slate-800">My Deferment Requests ({myDefermentRequests.length})</h3>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {myDefermentRequests.map((deferment: any) => (
                      <Card key={deferment.id} className="border border-amber-200 bg-gradient-to-br from-amber-50/50 to-white hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          {editingDefermentId === deferment.id ? (
                            // Edit mode
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <Label className="text-xs font-medium text-slate-600">Deferment Year (YYYY)</Label>
                                <Input
                                  type="text"
                                  maxLength={4}
                                  placeholder="2027"
                                  value={editDefermentData.deferral_year}
                                  onChange={(e) => setEditDefermentData((d) => ({ ...d, deferral_year: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                                  className="text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs font-medium text-slate-600">Reason</Label>
                                <Textarea
                                  value={editDefermentData.reason}
                                  onChange={(e) => setEditDefermentData((d) => ({ ...d, reason: e.target.value }))}
                                  rows={2}
                                  className="text-sm"
                                />
                              </div>
                              <div className="flex gap-2 pt-2">
                                <Button size="sm" onClick={saveEditDeferment} disabled={isSavingEdit} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                  {isSavingEdit ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                  Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingDefermentId(null)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            // View mode
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    deferment.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                                    deferment.status === "rejected" ? "bg-red-100 text-red-700" :
                                    deferment.status === "pending" || deferment.status === "pending_hod_review" ? "bg-amber-100 text-amber-700" :
                                    deferment.status === "pending_hr_review" || deferment.status === "hod_approved" ? "bg-blue-100 text-blue-700" :
                                    "bg-slate-100 text-slate-700"
                                  }`}>
                                    {deferment.status === "approved" ? "Approved" :
                                     deferment.status === "rejected" ? "Rejected" :
                                     deferment.status === "pending" || deferment.status === "pending_hod_review" ? "Pending HOD Review" :
                                     deferment.status === "hod_approved" || deferment.status === "pending_hr_review" ? "Pending HR Review" :
                                     deferment.status || "Pending"}
                                  </span>
                                  {canEditDeferment(deferment.status) && (
                                    <span className="text-xs text-emerald-600 font-medium">Editable</span>
                                  )}
                                </div>
                                <p className="text-sm text-slate-600 mb-1">
                                  <span className="font-medium">Deferment Year:</span> {deferment.requested_deferment_period || deferment.requested_deferment_year || "Not specified"}
                                </p>
                                <p className="text-sm text-slate-600 mb-1 line-clamp-2">
                                  <span className="font-medium">Reason:</span> {deferment.reason || "No reason provided"}
                                </p>
                                <p className="text-xs text-slate-400 mt-2">
                                  Submitted: {deferment.created_at ? new Date(deferment.created_at).toLocaleDateString() : "Unknown"}
                                </p>
                                {deferment.hod_decision_note && (
                                  <p className="text-xs text-slate-600 mt-1 bg-slate-100 p-2 rounded">
                                    <span className="font-medium">HOD Note:</span> {deferment.hod_decision_note}
                                  </p>
                                )}
                                {deferment.hr_office_decision_note && (
                                  <p className="text-xs text-slate-600 mt-1 bg-blue-50 p-2 rounded">
                                    <span className="font-medium">HR Note:</span> {deferment.hr_office_decision_note}
                                  </p>
                                )}
                                {/* Edit/Delete buttons for pending deferments */}
                                {canEditDeferment(deferment.status) && (
                                  <div className="flex gap-2 mt-3 pt-3 border-t border-amber-100">
                                    <Button size="sm" variant="outline" onClick={() => startEditDeferment(deferment)} className="text-xs">
                                      <Pencil className="h-3 w-3 mr-1" />
                                      Edit
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => deleteDeferment(deferment.id)} className="text-xs text-red-600 border-red-200 hover:bg-red-50">
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      Delete
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Loading indicator */}
              {isLoadingMyRequests && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  <span className="ml-2 text-sm text-slate-500">Loading your requests...</span>
                </div>
              )}
            </div>
          )}
          
          {selectedTab === "approved" && (
            <>
              {approvedRequests.length === 0 ? (
                <Card className="border border-dashed border-slate-300 bg-slate-50/80">
                  <CardContent className="py-14 text-center">
                    <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-slate-400" />
                    <p className="font-medium text-slate-700">No approved leave records yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {approvedRequests.map((request) => (
                    <LeaveRequestCard key={request.id} request={request} emphasizeApproved toast={toast} />
                  ))}
                </div>
              )}
            </>
          )}

          {selectedTab === "deferrments" && (
            <Card className="border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50/50">
              <CardHeader className="border-b border-amber-200 bg-gradient-to-r from-amber-500 to-yellow-500 text-white">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Defer Staff Annual Leave
                </CardTitle>
                <CardDescription className="text-amber-100">
                  Select a staff member&apos;s approved annual leave and defer it to a future leave year (HOD/RM/HR only)
                </CardDescription>
              </CardHeader>
              <CardContent className="py-6">
                {!isManagerView ? (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertDescription className="text-amber-900">Only Heads of Department, Regional Managers, and HR staff can submit leave deferment requests.</AlertDescription>
                  </Alert>
                ) : !Array.isArray(approvedRequests) || approvedRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="mx-auto mb-4 h-12 w-12 text-amber-400" />
                    <p className="font-medium text-slate-700">No approved leave available for deferment</p>
                    <p className="text-sm text-slate-500 mt-2">There are no approved annual leave requests in your department to defer at this time</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-white rounded-lg border border-amber-200 p-6 space-y-5">

                      {/* Step 1: Select Staff Leave Request */}
                      <div className="space-y-3">
                        <Label htmlFor="defer_request" className="text-sm font-semibold text-slate-700">
                          Select Staff Leave Request to Defer
                        </Label>
                        <select
                          id="defer_request"
                          value={selectedApprovedForDeferment || ""}
                          onChange={(e) => setSelectedApprovedForDeferment(e.target.value || null)}
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white text-slate-900"
                        >
                          <option value="">-- Choose a staff leave request --</option>
                          {approvedRequests.map((req) => {
                            const name = (req.user_name && req.user_name !== "Staff" && req.user_name.trim() !== "")
                              ? req.user_name
                              : "Unknown Staff"
                            const rank = req.rank ? ` | ${req.rank}` : ""
                            const loc = req.location ? ` | ${req.location}` : ""
                            const type = String(req.leave_type || "annual").replace(/_/g, " ")
                            const start = req.start_date ? new Date(req.start_date).toLocaleDateString("en-GB") : "?"
                            const end = req.end_date ? new Date(req.end_date).toLocaleDateString("en-GB") : "?"
                            return (
                              <option key={req.id} value={req.id}>
                                {name}{rank}{loc} | {type} — {start} to {end}
                              </option>
                            )
                          })}
                        </select>
                        {/* Show selected leave details inline */}
                        {selectedApprovedForDeferment && (() => {
                          const sel = approvedRequests.find((r) => r.id === selectedApprovedForDeferment)
                          if (!sel) return null
                          return (
                            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700 space-y-1">
                              <p><span className="font-medium text-slate-900">Staff:</span> {sel.user_name || "Unknown"}{sel.rank ? ` — ${sel.rank}` : ""}</p>
                              <p><span className="font-medium text-slate-900">Location:</span> {sel.location || "—"}</p>
                              <p><span className="font-medium text-slate-900">Leave Type:</span> {String(sel.leave_type || "annual").replace(/_/g, " ")}</p>
                              <p><span className="font-medium text-slate-900">Approved Period:</span> {sel.start_date ? new Date(sel.start_date).toLocaleDateString("en-GB") : "?"} &ndash; {sel.end_date ? new Date(sel.end_date).toLocaleDateString("en-GB") : "?"}</p>
                            </div>
                          )
                        })()}
                      </div>

                      {/* Step 2: Defer-to Date */}
                      <div className="space-y-3">
                        <Label htmlFor="deferral_year" className="text-sm font-semibold text-slate-700">
                          Defer To Leave Year (YYYY)
                        </Label>
                        <Input
                          id="deferral_year"
                          type="text"
                          placeholder={String(new Date().getFullYear() + 1)}
                          value={deferralYear}
                          onChange={(e) => setDeferralYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          maxLength={4}
                          className="px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <p className="text-xs text-slate-500">Enter the 4-digit year the leave will be moved to (e.g. {new Date().getFullYear() + 1})</p>
                      </div>

                      {/* Step 3: Reason */}
                      <div className="space-y-3">
                        <Label htmlFor="deferment_reason" className="text-sm font-semibold text-slate-700">
                          Reason for Deferment
                        </Label>
                        <Textarea
                          id="deferment_reason"
                          placeholder="Explain why this leave is being deferred to a future year..."
                          value={defermentReason}
                          onChange={(e) => setDefermentReason(e.target.value)}
                          rows={3}
                          className="px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <Button
                        onClick={submitDefermentRequest}
                        disabled={isSubmittingDeferment || !selectedApprovedForDeferment || !deferralYear || deferralYear.length < 4}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 rounded-lg transition-all"
                      >
                        {isSubmittingDeferment ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Submitting Deferment...
                          </>
                        ) : (
                          "Submit Deferment Request"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {selectedTab === "recalls" && (
            <Card className="border border-rose-200 bg-gradient-to-br from-rose-50 to-red-50/50">
              <CardHeader className="border-b border-rose-200 bg-gradient-to-r from-rose-600 to-red-600 text-white">
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpRight className="h-5 w-5" />
                  Recall Your Leave
                </CardTitle>
                <CardDescription className="text-rose-100">Request to recall active or upcoming leave (HOD/RM/HR only)</CardDescription>
              </CardHeader>
              <CardContent className="py-6">
                {!isManagerView ? (
                  <Alert className="border-blue-200 bg-blue-50">
                    <AlertDescription className="text-blue-900">Only Heads of Department, Regional Managers, and HR staff can submit leave recall requests.</AlertDescription>
                  </Alert>
                ) : typeof approvedRequests === "undefined" || approvedRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <ArrowUpRight className="mx-auto mb-4 h-12 w-12 text-rose-400" />
                    <p className="font-medium text-slate-700">No approved leave to recall</p>
                    <p className="text-sm text-slate-500 mt-2">No active or upcoming approved leave available for recall</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-white rounded-lg border border-rose-200 p-6 space-y-5">
                      <div className="space-y-3">
                        <Label htmlFor="recall_request" className="text-sm font-semibold text-slate-700">Select Leave Request to Recall</Label>
                        <select
                          id="recall_request"
                          value={selectedApprovedForRecall || ""}
                          onChange={(e) => setSelectedApprovedForRecall(e.target.value || null)}
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white text-slate-900"
                        >
                          <option value="">-- Choose a leave request --</option>
                          {Array.isArray(approvedRequests) && approvedRequests.map((req) => {
                            const name = (req.user_name && req.user_name !== "Staff" && req.user_name.trim() !== "")
                              ? req.user_name
                              : "Unknown Staff"
                            const rank = req.rank ? ` | ${req.rank}` : ""
                            const loc = req.location ? ` | ${req.location}` : ""
                            const type = String(req.leave_type || "annual").replace(/_/g, " ")
                            const start = req.start_date ? new Date(req.start_date).toLocaleDateString("en-GB") : "?"
                            const end = req.end_date ? new Date(req.end_date).toLocaleDateString("en-GB") : "?"
                            return (
                              <option key={req.id} value={req.id}>
                                {name}{rank}{loc} | {type} — {start} to {end}
                              </option>
                            )
                          })}
                        </select>
                      </div>

                      <div className="space-y-3">
                        <Label htmlFor="recall_date" className="text-sm font-semibold text-slate-700">Recall Date (YYYY-MM-DD)</Label>
                        <Input
                          id="recall_date"
                          type="date"
                          value={recallDateInput}
                          onChange={(e) => setRecallDateInput(e.target.value)}
                          className="px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>

                      <div className="space-y-3">
                        <Label htmlFor="recall_reason" className="text-sm font-semibold text-slate-700">Reason for Recall</Label>
                        <Textarea
                          id="recall_reason"
                          placeholder="Explain the reason for recalling this leave..."
                          value={recallReasonInput}
                          onChange={(e) => setRecallReasonInput(e.target.value)}
                          rows={3}
                          className="px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>

                      <Button
                        onClick={submitRecallRequest}
                        disabled={isSubmittingRecall || !selectedApprovedForRecall || !recallDateInput}
                        className="w-full bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-semibold py-2.5 rounded-lg transition-all"
                      >
                        {isSubmittingRecall ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          "Submit Recall Request"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {selectedTab === "approved-memos" && isManagerView && (
            <Card className="border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50/50">
              <CardHeader className="border-b border-teal-200 bg-gradient-to-r from-teal-600 to-cyan-600 text-white">
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Approved Leave Memos
                </CardTitle>
                <CardDescription className="text-teal-100">Download signed approval memos for your staff&apos;s approved leave requests</CardDescription>
              </CardHeader>
              <CardContent className="py-6">
                {isLoadingApprovedMemos ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                  </div>
                ) : staffApprovedMemos.length === 0 ? (
                  <div className="text-center py-12">
                    <Download className="mx-auto mb-4 h-12 w-12 text-teal-400" />
                    <p className="font-medium text-slate-700">No approved memos available</p>
                    <p className="text-sm text-slate-500 mt-2">Your staff have no approved leave requests yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Search Field */}
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                      <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search by name, email, leave type..."
                          value={memosSearchQuery}
                          onChange={(e) => {
                            setMemosSearchQuery(e.target.value)
                            setMemosCurrentPage(1) // Reset to first page on search
                          }}
                          className="w-full pl-10 pr-4 py-2 border border-teal-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                        />
                      </div>
                      <p className="text-sm text-slate-600">
                        Showing {paginatedMemos.length} of {filteredMemos.length} memos
                      </p>
                    </div>
                    
                    {/* Memos List */}
                    <div className="space-y-3">
                      {paginatedMemos.length === 0 ? (
                        <div className="text-center py-8">
                          <Search className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                          <p className="text-slate-500">No memos match your search</p>
                        </div>
                      ) : (
                        paginatedMemos.map((memo: any) => {
                          const isSigned = memo.approver_signature || memo.approval_date
                          const isYetToSign = !isSigned
                          
                          return (
                          <div key={memo.id} className="border border-teal-200 rounded-lg p-4 hover:bg-teal-50/50 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                  <p className="font-semibold text-slate-900">{memo.staff_name}</p>
                                  {isYetToSign && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800">
                                      Yet to Sign
                                    </span>
                                  )}
                                  {isSigned && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
                                      ✓ Signed
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">{memo.email}</p>
                                <p className="text-sm text-slate-700 mt-2">{memo.leave_type} Leave</p>
                                <p className="text-xs text-slate-600 mt-1">{new Date(memo.start_date).toLocaleDateString()} to {new Date(memo.end_date).toLocaleDateString()}</p>
                                <p className="text-xs text-slate-500 mt-1">Location: {memo.location}</p>
                                {isYetToSign && memo.assigned_to && (
                                  <p className="text-xs text-amber-600 mt-2 font-medium">Awaiting approval from: {memo.assigned_to}</p>
                                )}
                              </div>
                              <div className="flex gap-2 flex-shrink-0">
                                <Button
                                  size="sm"
                                  className="bg-teal-600 hover:bg-teal-700 text-white"
                                  onClick={() => {
                                    // Download memo
                                    window.open(memo.memo_url, "_blank")
                                  }}
                                >
                                  <Download className="h-3.5 w-3.5 mr-1" />
                                  Download
                                </Button>
                              </div>
                            </div>
                          </div>
                        )
                        })
                      )}
                    </div>
                    
                    {/* Pagination Controls */}
                    {memosTotalPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t border-teal-100">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setMemosCurrentPage(p => Math.max(1, p - 1))}
                          disabled={memosCurrentPage === 1}
                          className="gap-1"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="flex items-center gap-2">
                          {Array.from({ length: memosTotalPages }, (_, i) => i + 1).map(page => (
                            <button
                              key={page}
                              onClick={() => setMemosCurrentPage(page)}
                              className={`h-8 w-8 rounded-full text-sm font-medium transition-colors ${
                                page === memosCurrentPage
                                  ? "bg-teal-600 text-white"
                                  : "text-slate-600 hover:bg-teal-100"
                              }`}
                            >
                              {page}
                            </button>
                          ))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setMemosCurrentPage(p => Math.min(memosTotalPages, p + 1))}
                          disabled={memosCurrentPage === memosTotalPages}
                          className="gap-1"
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {selectedTab === "payment-advice" && canAccessPaymentAdvice && (
            <PaymentAdviceClient userRole={normalizedRole} />
          )}

        {isManagerView && selectedTab === "pending-approvals" && (
          <>
            <Alert className="border-blue-200 bg-blue-50">
              <AlertDescription>
                Requests pending for {inactivityDays} days or more are marked as delayed and should be actioned immediately to avoid automatic supervisor timeout approvals.
              </AlertDescription>
            </Alert>
            {renderManagerNotifications(adminAllPending, "No pending leave requests to approve")}
          </>
        )}

        {isAdminView && selectedTab === "role-staff" && (
          <>
            {renderManagerNotifications(adminStaffQueue, "No staff queue requests pending")}
          </>
        )}
        
        {isAdminView && selectedTab === "role-hod" && (
          <>
            {renderManagerNotifications(adminHodQueue, "No HOD queue requests pending")}
          </>
        )}
        
        {isAdminView && selectedTab === "role-regional" && (
          <>
            {renderManagerNotifications(adminRegionalQueue, "No regional queue requests pending")}
          </>
        )}
        
        {isAdminView && selectedTab === "delayed" && (
          <>
            {renderManagerNotifications(adminDelayedQueue, `No delayed requests at or above ${inactivityDays} days`)}
          </>
        )}

        {isManagerView && selectedTab === "history" && (
          <>
            <Alert className="border-slate-200 bg-white shadow-sm">
              <AlertDescription>Historical leave request data will be surfaced here when the archive view is enabled.</AlertDescription>
            </Alert>
          </>
        )}
        </div>
      </div>

      <Dialog open={Boolean(editingRequest)} onOpenChange={(open) => { if (!open) closeEditDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Leave Request</DialogTitle>
            <DialogDescription>
              You can update this request only before HOD/manager review starts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit_leave_type">Leave Type</Label>
              <Input id="edit_leave_type" value={editLeaveType} onChange={(e) => setEditLeaveType(e.target.value)} placeholder="annual" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit_start_date">Start Date</Label>
                <Input id="edit_start_date" type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit_end_date">End Date</Label>
                <Input id="edit_end_date" type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_reason">Reason</Label>
              <Textarea id="edit_reason" rows={4} value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Provide reason for leave" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>Cancel</Button>
            <Button onClick={handleUpdateLeaveRequest}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LeaveMetricCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string
  value: string
  hint: string
  tone: "blue" | "emerald" | "cyan" | "violet"
  icon: React.ReactNode
}) {
  const tones = {
    blue: "border-blue-300/20 bg-blue-300/10 text-blue-50",
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-50",
    cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-50",
    violet: "border-violet-300/20 bg-violet-300/10 text-violet-50",
  }

  return (
    <div className={`rounded-2xl border p-4 backdrop-blur ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/10 p-2 text-white">{icon}</div>
      </div>
      <p className="mt-2 text-xs text-white/70">{hint}</p>
    </div>
  )
}

function LeaveRequestCard({
  request,
  emphasizeApproved = false,
  canEdit = false,
  onEdit,
  toast,
}: {
  request: LeaveRequest
  emphasizeApproved?: boolean
  canEdit?: boolean
  onEdit?: () => void
  toast?: ReturnType<typeof useToast>["toast"]
}) {
  const [respondingToHod, setRespondingToHod] = useState(false)
  const [counterStartDate, setCounterStartDate] = useState("")
  const [counterEndDate, setCounterEndDate] = useState("")
  const [counterReason, setCounterReason] = useState("")
  const normalizedStatus = String(request.status || "").toLowerCase()
  const isApproved = ["approved", "hr_approved"].includes(normalizedStatus)
  const isPending = [
    "pending",
    "pending_hod",
    "pending_hr",
    "pending_manager_review",
    "pending_hod_review",
    "manager_confirmed",
    "hod_approved",
    "hr_office_forwarded",
  ].includes(normalizedStatus)

  // Check if HOD has requested changes - check both hod_decision field and if dates are adjusted
  const hasHodChanges = (request as any)?.hod_decision === "pending_staff_response" || 
                        Boolean((request as any)?.adjusted_start_date && (request as any)?.adjusted_end_date)
  const hodSuggestedStart = (request as any)?.adjusted_start_date
  const hodSuggestedEnd = (request as any)?.adjusted_end_date

  const handleAcceptHodChanges = async () => {
    try {
      const response = await fetch("/api/leave/respond-to-hod-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveRequestId: request.id,
          action: "accept",
        }),
      })
      
      if (response.ok) {
        toast?.({ title: "Accepted", description: "HOD date changes accepted successfully" })
        setRespondingToHod(false)
        window.location.reload()
      }
    } catch (error) {
      toast?.({ title: "Error", description: "Failed to accept changes", variant: "destructive" })
    }
  }

  const handleSubmitCounterOffer = async () => {
    if (!counterStartDate || !counterEndDate) {
      toast?.({ title: "Error", description: "Please provide counter-offer dates", variant: "destructive" })
      return
    }

    try {
      const response = await fetch("/api/leave/respond-to-hod-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveRequestId: request.id,
          action: "counter",
          counterStartDate,
          counterEndDate,
          reason: counterReason,
        }),
      })
      
      if (response.ok) {
        toast?.({ title: "Submitted", description: "Counter-offer submitted to HOD for approval" })
        setRespondingToHod(false)
        setCounterStartDate("")
        setCounterEndDate("")
        setCounterReason("")
        window.location.reload()
      }
    } catch (error) {
      toast?.({ title: "Error", description: "Failed to submit counter-offer", variant: "destructive" })
    }
  }

  const statusTone =
    isApproved
      ? "border-emerald-200 bg-emerald-50/60"
      : isPending
        ? "border-blue-200 bg-blue-50/60"
        : "border-rose-200 bg-rose-50/60"

  return (
    <Card className={`overflow-hidden border shadow-sm ${emphasizeApproved ? "border-emerald-200 bg-emerald-50/70" : statusTone}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex flex-col gap-1 mb-2">
              <CardTitle className="text-lg text-slate-900">{formatLeaveType(request.leave_type)} Leave</CardTitle>
              {(request.user_name || request.rank || request.location) && (
                <div className="text-sm text-slate-600 flex flex-wrap items-center gap-2">
                  {request.user_name && <span className="font-medium text-slate-700">{request.user_name}</span>}
                  {request.rank && <span>• {request.rank}</span>}
                  {request.location && <span>• {request.location}</span>}
                </div>
              )}
            </div>
            <CardDescription className="mt-1 line-clamp-2">{request.reason}</CardDescription>
          </div>
          <div className="flex gap-2">
            {hasHodChanges && (
              <Badge className="bg-amber-600 text-white hover:bg-amber-600">HOD Changes Requested</Badge>
            )}
            <Badge className={isApproved ? "bg-emerald-600 text-white hover:bg-emerald-600" : isPending ? "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50" : "bg-rose-600 text-white hover:bg-rose-600"}>
              {formatLeaveType(request.status)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Start Date</p>
            <p className="mt-1 font-semibold text-slate-900">{format(new Date(request.start_date), "MMM dd, yyyy")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">End Date</p>
            <p className="mt-1 font-semibold text-slate-900">{format(new Date(request.end_date), "MMM dd, yyyy")}</p>
          </div>
        </div>

        {/* HOD Suggested Changes */}
        {hasHodChanges && hodSuggestedStart && hodSuggestedEnd && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900 mb-2">HOD Suggested Dates</p>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div className="rounded border border-amber-200 bg-white p-2">
                <p className="text-xs text-amber-700 font-medium">Start</p>
                <p className="font-semibold text-amber-900">{format(new Date(hodSuggestedStart), "MMM dd, yyyy")}</p>
              </div>
              <div className="rounded border border-amber-200 bg-white p-2">
                <p className="text-xs text-amber-700 font-medium">End</p>
                <p className="font-semibold text-amber-900">{format(new Date(hodSuggestedEnd), "MMM dd, yyyy")}</p>
              </div>
            </div>
          </div>
        )}

        {/* HOD Response UI - Only show if HOD changes requested and NOT yet approved by HR */}
        {hasHodChanges && !respondingToHod && !isApproved && (
          <div className="flex gap-2">
            <Button
              onClick={handleAcceptHodChanges}
              size="sm"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Accept Changes
            </Button>
            <Button
              onClick={() => setRespondingToHod(true)}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              Counter-Offer
            </Button>
          </div>
        )}

        {/* Counter-Offer Form */}
        {hasHodChanges && respondingToHod && (
          <div className="space-y-3 border-t pt-3">
            <p className="text-sm font-semibold text-slate-700">Suggest Alternative Dates</p>
            <input
              type="date"
              value={counterStartDate}
              onChange={(e) => setCounterStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Start Date"
            />
            <input
              type="date"
              value={counterEndDate}
              onChange={(e) => setCounterEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="End Date"
            />
            <textarea
              value={counterReason}
              onChange={(e) => setCounterReason(e.target.value)}
              placeholder="Reason for counter-offer (optional)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSubmitCounterOffer}
                size="sm"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Submit Counter
              </Button>
              <Button
                onClick={() => setRespondingToHod(false)}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {canEdit && onEdit && !hasHodChanges && (
          <Button variant="outline" size="sm" onClick={onEdit} className="w-full">
            Edit Before Review
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function formatLeaveType(value: string) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

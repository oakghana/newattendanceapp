"use client"

import { useState, useEffect, useCallback } from "react"
import { displayRole } from "@/lib/role-mapping"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Users, Plus, Search, Edit, Trash2, UserCheck, UserX, Key, MapPin, Filter, Building2, Link2, Link2Off } from "lucide-react"
import { PasswordManagement } from "./password-management"
import { useNotifications } from "@/components/ui/notification-system"

const authenticatedFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  return fetch(input, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  })
}

interface StaffMember {
  id: string
  first_name: string
  last_name: string
  email: string
  employee_id: string
  position: string
  role: string
  staff_category?: "Manager" | "Senior" | "Officer" | "Junior" | string | null
  is_active: boolean
  department_id?: string
  assigned_location_id?: string
  date_of_appointment?: string | null
  years_of_service?: number | string | null
  contact_number?: string | null
  departments?: {
    id: string
    name: string
    code: string
  }
  geofence_locations?: {
    id: string
    name: string
    address: string
  }
  updated_at?: string
  // optional information about who last modified this record
  last_modified_by?: {
    id: string
    name: string
    role: string
    at: string
  }
}

interface Department {
  id: string
  name: string
  code: string
}

interface Location {
  id: string
  name: string
  address: string
  latitude: number
  longitude: number
}

export function StaffManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [selectedDepartment, setSelectedDepartment] = useState("all")
  const [selectedRole, setSelectedRole] = useState("all")
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [totalPages, setTotalPages] = useState(1)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const { showSuccess, showError, showWarning, showFieldError } = useNotifications()

  const [newStaff, setNewStaff] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    employee_id: "",
    department_id: "",
    position: "",
    staff_category: "Junior",
    role: "staff",
    assigned_location_id: "",
    date_of_appointment: "",
    years_of_service: "",
    contact_number: "",
  })

  const [currentUserRole, setCurrentUserRole] = useState<string>("staff")
  const [currentUserLocationId, setCurrentUserLocationId] = useState<string | null>(null)
  const normalizedCurrentUserRole = String(currentUserRole).trim().toLowerCase().replace(/[-\s]+/g, "_")
  const isAdministrator = ["admin", "administrator"].includes(normalizedCurrentUserRole)
  const isItAdmin = ["it_admin", "itadmin"].includes(normalizedCurrentUserRole)
  const canManageStaffLinks = isAdministrator || isItAdmin

  // Calculate years of service based on date of appointment
  const calculateYearsOfService = (dateStr: string): number | string => {
    if (!dateStr) return ""
    try {
      const appointmentDate = new Date(dateStr)
      const today = new Date()
      let years = today.getFullYear() - appointmentDate.getFullYear()
      const monthDiff = today.getMonth() - appointmentDate.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < appointmentDate.getDate())) {
        years--
      }
      return Math.max(0, years)
    } catch {
      return ""
    }
  }

  const fetchStaff = useCallback(async () => {
    try {
      console.log("[v0] Fetching staff with filters:", {
        searchTerm: debouncedSearchTerm,
        selectedDepartment,
        selectedRole,
        page,
      })
      const params = new URLSearchParams()
      const trimmedSearch = debouncedSearchTerm.trim()
      const effectiveLimit = trimmedSearch ? 2000 : limit

      if (trimmedSearch) params.append("search", trimmedSearch)
      if (selectedDepartment !== "all") params.append("department", selectedDepartment)
      if (selectedRole !== "all") params.append("role", selectedRole)
      params.append("page", String(trimmedSearch ? 1 : page))
      params.append("limit", String(effectiveLimit))

      const response = await authenticatedFetch(`/api/admin/staff?${params}`)
      const result = await response.json()
      console.log("[v0] Staff fetch result:", result)

      if (response.status === 401) {
        setError("Your session has expired. Please sign in again.")
        setStaff([])
        return
      }

      if (result.success) {
        const rows = Array.isArray(result.data)
          ? result.data.map((row: StaffMember) => ({
              ...row,
              staff_category: row.staff_category || "Junior",
              role: displayRole(row.role),
            }))
          : []
        setStaff(rows)
        setTotalPages(result.pagination?.totalPages || 1)
        setError(null)
      } else {
        console.error("[v0] Failed to fetch staff:", result.error)
        setError(result.error)
      }
    } catch (error) {
      console.error("[v0] Staff fetch exception:", error)
      setError("Failed to fetch staff")
    } finally {
      setLoading(false)
    }
  }, [debouncedSearchTerm, selectedDepartment, selectedRole, page, limit])

  useEffect(() => {
    fetchDepartments()
    fetchLocations()
    fetchCurrentUserRole()
  }, [])

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300) // Wait 300ms after user stops typing

    return () => clearTimeout(debounceTimer)
  }, [searchTerm])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearchTerm, selectedDepartment, selectedRole])

  useEffect(() => {
    fetchStaff()
  }, [fetchStaff])

  const fetchDepartments = async () => {
    try {
      console.log("[v0] Fetching departments...")
      const response = await authenticatedFetch("/api/admin/departments")
      const result = await response.json()
      console.log("[v0] Departments fetch result:", result)

      if (result.success || Array.isArray(result.departments) || Array.isArray(result.data)) {
        setDepartments(result.departments || result.data || [])
      } else {
        console.warn("[v0] No departments returned, using empty array")
        setDepartments([])
      }
    } catch (error) {
      console.error("[v0] Departments fetch exception:", error)
      setDepartments([])
    }
  }

  const fetchLocations = async () => {
    try {
      console.log("[v0] Fetching locations...")
      const response = await authenticatedFetch("/api/admin/locations")
      const result = await response.json()
      console.log("[v0] Locations fetch result:", result)

      if (result.success) {
        setLocations(result.data || [])
      } else {
        console.error("[v0] Failed to fetch locations:", result.error)
        showError("Failed to load locations")
      }
    } catch (error) {
      console.error("[v0] Locations fetch exception:", error)
      showError("Error loading locations")
    }
  }

  const [supabaseConfigMissing, setSupabaseConfigMissing] = useState(false)

  const fetchCurrentUserRole = async () => {
    try {
      console.log("[v0] Fetching current user role...")
      const response = await authenticatedFetch("/api/auth/current-user")
      const result = await response.json()
      console.log("[v0] Current user role fetch result:", result)
      if (result.success && result.user) {
        console.log("[v0] Setting current user role to:", result.user.role)
        setCurrentUserRole(result.user.role)
        if (result.user.assigned_location_id) {
          setCurrentUserLocationId(result.user.assigned_location_id)
        }
      } else {
        console.error("[v0] Failed to fetch user role - response:", result)
      }
    } catch (error) {
      console.error("[v0] Failed to fetch current user role:", error)
    }

    // Also probe server-side supabase config to detect misconfiguration early
    try {
      const cfg = await authenticatedFetch('/api/admin/supabase-config')
      const data = await cfg.json()
      if (!data.hasServiceKey) {
        console.warn('[v0] Server missing SUPABASE_SERVICE_ROLE_KEY')
        setSupabaseConfigMissing(true)
      }
    } catch (err) {
      console.error('[v0] Failed to fetch supabase config:', err)
    }
  }

  const handleAddStaff = async () => {
    try {
      setError(null)

      if (!newStaff.email || !newStaff.first_name || !newStaff.last_name || !newStaff.employee_id) {
        if (!newStaff.first_name) showFieldError("First Name", "First name is required")
        if (!newStaff.last_name) showFieldError("Last Name", "Last name is required")
        if (!newStaff.email) showFieldError("Email", "Email address is required")
        if (!newStaff.employee_id) showFieldError("Employee ID", "Employee ID is required")
        return
      }

      if (!newStaff.assigned_location_id) {
        showFieldError("Location", "Please assign a location to this staff member")
        return
      }

      console.log("[v0] Adding new staff:", newStaff)
      const response = await authenticatedFetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStaff),
      })

      // Handle auth failures explicitly so users see a clear message
      if (response.status === 401 || response.status === 403) {
        const msg = "Session expired or unauthorized. Please sign in again."
        showError(msg, "Authentication Required")
        setError(msg)
        setTimeout(() => (window.location.href = "/signin"), 1200)
        return
      }

      const result = await response.json()
      console.log("[v0] Add staff result:", result)

      if (result.success) {
        showSuccess("Staff member added successfully", "Staff Added")
        setSuccess("Staff member added successfully")
        setIsAddDialogOpen(false)
        setNewStaff({
          email: "",
          password: "",
          first_name: "",
          last_name: "",
          employee_id: "",
          department_id: "",
          position: "",
          staff_category: "Junior",
          role: "staff",
          assigned_location_id: "",
          date_of_appointment: "",
          years_of_service: "",
          contact_number: "",
        })
        fetchStaff()
        // Only Administrators manage HOD assignments from Staff Management.
        if (isAdministrator && result.data) {
          openHodLinkDialog(result.data)
        }
      } else {
        // Detect DB role enumeration error and show actionable guidance
        if (result.error && String(result.error).toLowerCase().includes("database constraint prevents the 'audit_staff'")) {
          const guidance = result.details || "Please add 'audit_staff' to user_profiles role constraint"
          showError(`Failed to create Audit Staff: ${guidance}`, "DB Constraint")
          setError(`DB Constraint: ${guidance}`)
        } else {
          const detailText = result.details ? (typeof result.details === 'string' ? result.details : JSON.stringify(result.details)) : null
          const msg = result.error ? (detailText ? `${result.error}: ${detailText}` : result.error) : (detailText || "Failed to add staff member")
          showError(msg, "Add Staff Failed")
          setError(msg)
        }
      }
    } catch (error) {
      console.error("[v0] Add staff exception:", error)
      const errorMessage = "Failed to add staff member"
      showError(errorMessage, "Add Staff Error")
      setError(errorMessage)
    }
  }

  const handleUpdateStaff = async (staffId: string, updates: Partial<StaffMember>) => {
    try {
      setError(null)
      console.log("[v0] Updating staff member:", staffId, updates)
      const response = await authenticatedFetch(`/api/admin/staff/${staffId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })

      if (response.status === 401 || response.status === 403) {
        const msg = "Session expired or unauthorized. Please sign in again."
        showError(msg, "Authentication Required")
        setError(msg)
        setTimeout(() => (window.location.href = "/signin"), 1200)
        return
      }

      const result = await response.json()
      console.log("[v0] Update staff result:", result)

      if (result.success) {
        showSuccess("Staff member updated successfully", "Staff Updated")
        setSuccess("Staff member updated successfully")
        fetchStaff()
      } else {
        showError(result.error || "Failed to update staff member", "Update Failed")
        setError(result.error)
      }
    } catch (error) {
      console.error("[v0] Update exception:", error)
      const errorMessage = "Failed to update staff member"
      showError(errorMessage, "Update Error")
      setError(errorMessage)
    }
  }

  const handleDeactivateStaff = async (staffId: string) => {
    if (!confirm("Are you sure you want to deactivate this staff member?")) return

    try {
      setError(null)
      const response = await authenticatedFetch(`/api/admin/staff/${staffId}`, {
        method: "DELETE",
      })

      if (response.status === 401 || response.status === 403) {
        const msg = "Session expired or unauthorized. Please sign in again."
        showError(msg, "Authentication Required")
        setError(msg)
        setTimeout(() => (window.location.href = "/signin"), 1200)
        return
      }

      const result = await response.json()

      if (result.success) {
        showSuccess("Staff member deactivated successfully", "Staff Deactivated")
        setSuccess("Staff member deactivated successfully")
        fetchStaff()
      } else {
        showError(result.error || "Failed to deactivate staff member", "Deactivation Failed")
        setError(result.error)
      }
    } catch (error) {
      const errorMessage = "Failed to deactivate staff member"
      showError(errorMessage, "Deactivation Error")
      setError(errorMessage)
    }
  }

  const handleEditStaff = async () => {
    if (!editingStaff) return

    try {
      setError(null)

      if (!editingStaff.assigned_location_id || editingStaff.assigned_location_id === "none") {
        const headOfficeLocation = locations.find((loc) => loc.name.toLowerCase().includes("head office"))
        if (!headOfficeLocation) {
          showFieldError("Location", "Please assign a location to this staff member")
          return
        }
      }

      const updateData = {
        first_name: editingStaff.first_name,
        last_name: editingStaff.last_name,
        email: editingStaff.email,
        employee_id: editingStaff.employee_id,
        position: editingStaff.position,
        staff_category: editingStaff.staff_category || "Junior",
        role: editingStaff.role,
        department_id: editingStaff.department_id || editingStaff.departments?.id,
        is_active: editingStaff.is_active,
        assigned_location_id:
          editingStaff.assigned_location_id ||
          editingStaff.geofence_locations?.id ||
          null,
        date_of_appointment: editingStaff.date_of_appointment || null,
        years_of_service:
          editingStaff.years_of_service !== undefined && editingStaff.years_of_service !== ""
            ? parseInt(String(editingStaff.years_of_service), 10)
            : null,
        contact_number: editingStaff.contact_number || null,
      }

      console.log("[v0] Updating staff member:", editingStaff.id, updateData)

      const response = await authenticatedFetch(`/api/admin/staff/${editingStaff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })

      console.log("[v0] Update response status:", response.status)

      if (response.status === 401) {
        const msg = "Session expired. Please sign in again."
        showError(msg, "Authentication Required")
        setError(msg)
        setTimeout(() => (window.location.href = "/signin"), 1200)
        return
      }

      if (!response.ok) {
        const text = await response.text()
        let parsed: any = null
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = { error: text }
        }

        // Prefer a non-empty details object, otherwise fall back to error or raw text
        const hasDetails = parsed.details && typeof parsed.details === "object" && Object.keys(parsed.details).length > 0
        const errorDetail = hasDetails ? parsed.details : (parsed.error || text || `HTTP ${response.status}`)
        const errorString = typeof errorDetail === "object" ? JSON.stringify(errorDetail) : String(errorDetail)

        console.error("[v0] Update response error:", errorDetail)
        throw new Error(`HTTP ${response.status}: ${errorString}`)
      }

      const result = await response.json()
      console.log("[v0] Update response data:", result)

      if (result.success && result.data) {
        if (updateData.staff_category && result.data.staff_category !== updateData.staff_category) {
          throw new Error("The server did not confirm the requested staff category")
        }

        showSuccess("Staff member updated successfully", "Staff Updated")
        setSuccess("Staff member updated successfully")

        // Immediately update the local staff array so the table shows fresh data
        const updatedMember: StaffMember = result.data ?? { ...editingStaff, ...updateData }
        setStaff((prev) =>
          prev.map((s) =>
            s.id === editingStaff.id
              ? { ...s, ...updatedMember, role: displayRole(updatedMember.role ?? s.role) }
              : s
          )
        )

        setEditingStaff(null)
        // Also re-fetch in background to sync any server-computed fields
        fetchStaff()
      } else {
        console.error("[v0] Update failed:", result.error)
        if (result.error && String(result.error).toLowerCase().includes("database constraint prevents the 'audit_staff'")) {
          const guidance = result.details || "Please add 'audit_staff' to user_profiles role constraint"
          showError(`Failed to update role: ${guidance}`, "DB Constraint")
          setError(`DB Constraint: ${guidance}`)
        } else {
          const errorMessage = result.error || "Failed to update staff member"
          showError(errorMessage, "Update Failed")
          setError(errorMessage)
        }
      }
    } catch (error) {
      console.error("[v0] Update exception:", error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Friendly handling for network errors
      if (String(errorMessage).toLowerCase().includes("failed to fetch") || String(errorMessage).toLowerCase().includes("network")) {
        const friendly = "Network error: Unable to reach the server. Check the dev server and environment configuration."
        showError(friendly, "Network Error")
        setError(friendly)
        return
      }

      showError(errorMessage, "Update Error")
      setError(errorMessage)
    }
  }

  // ── HOD Linkage ─────────────────────────────────────────────
  const [hodLinkStaff, setHodLinkStaff] = useState<StaffMember | null>(null)
  const [hodLinkHodIds, setHodLinkHodIds] = useState<string[]>([])
  const [hodLinkLoading, setHodLinkLoading] = useState(false)
  const [hodLinkError, setHodLinkError] = useState<string | null>(null)
  const [hodSearchQuery, setHodSearchQuery] = useState<string>("")

  const [hodCandidates, setHodCandidates] = useState<StaffMember[]>([])

  const openHodLinkDialog = async (member: StaffMember) => {
    setHodLinkStaff(member)
    setHodLinkHodIds(((member as any).hod_links || []).map((hod: any) => String(hod.id)))
    setHodLinkError(null)
    try {
      // Fetch all roles that act as head of department in parallel
      const [resDH, resRM, resMHR, resDHR] = await Promise.all([
        authenticatedFetch("/api/admin/staff?role=department_head&limit=200"),
        authenticatedFetch("/api/admin/staff?role=regional_manager&limit=200"),
        authenticatedFetch("/api/admin/staff?role=manager_hr&limit=200"),
        authenticatedFetch("/api/admin/staff?role=director_hr&limit=200"),
      ])
      const [dh, rm, mhr, dhr]: StaffMember[][] = await Promise.all([
        resDH.json().then((d: any) => d.data || []),
        resRM.json().then((d: any) => d.data || []),
        resMHR.json().then((d: any) => d.data || []),
        resDHR.json().then((d: any) => d.data || []),
      ])
      // Deduplicate by id and sort by name
      const all = [...dh, ...rm, ...mhr, ...dhr]
      const seen = new Set<string>()
      const unique = all.filter((s) => {
        if (seen.has(s.id)) return false
        seen.add(s.id)
        return true
      }).sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      )
      setHodCandidates(unique)
    } catch {
      setHodCandidates([])
    }
  }

  const handleHodLink = async () => {
    if (!hodLinkStaff) return
    setHodLinkLoading(true)
    setHodLinkError(null)
    try {
      const res = await authenticatedFetch("/api/loan/lookups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert_hod_linkage_batch", staff_user_id: hodLinkStaff.id, hod_user_ids: hodLinkHodIds }),
      })
      const result = await res.json()
      if (result.success) {
        const count = hodLinkHodIds.length
        showSuccess(
          count > 0
            ? `${hodLinkStaff.first_name} ${hodLinkStaff.last_name} assigned to ${count} HOD(s)`
            : `${hodLinkStaff.first_name} ${hodLinkStaff.last_name} removed from all HOD assignments`,
          count > 0 ? "HOD Assignment Updated" : "HOD Assignments Cleared",
        )
        await fetchStaff()
        setHodLinkStaff(null)
        setHodLinkHodIds([])
        setHodLinkError(null)
      } else {
        setHodLinkError(result.error || "Failed to update HOD assignments")
      }
    } catch (e: any) {
      setHodLinkError(e?.message || "Network error")
    } finally {
      setHodLinkLoading(false)
    }
  }

  return (
    <>
    <div className="space-y-8">
      <Card className="shadow-sm border-0 bg-gradient-to-br from-card to-card/50">
        <CardHeader className="pb-6">
          <CardTitle className="text-xl font-heading font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Staff Directory
          </CardTitle>
          <CardDescription className="text-base">
            Manage QCC staff members, roles, and location assignments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive" className="border-destructive/20 bg-destructive/5">
              <AlertDescription className="font-medium">{error}</AlertDescription>
            </Alert>
          )}

          {currentUserRole === "regional_manager" && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm text-primary mb-2">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="font-medium">
                Showing all staff at:{" "}
                <span className="font-semibold">
                  {locations.find((l) => l.id === currentUserLocationId)?.name || "Your assigned location"}
                </span>
              </span>
              <span className="text-xs text-muted-foreground ml-1">(filter by department below)</span>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              {/* Search Input */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-background/50 border-border/50 focus:bg-background"
                />
              </div>

              {/* Department Filter */}
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="w-48 bg-background/50 border-border/50">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Role Filter */}
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-40 bg-background/50 border-border/50">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="regional_manager">Regional Manager</SelectItem>
                  <SelectItem value="it-admin">IT-Admin</SelectItem>
                  <SelectItem value="department_head">Department Head</SelectItem>
                  <SelectItem value="audit_staff">Audit Staff</SelectItem>
                  <SelectItem value="accounts">Accounts</SelectItem>
                  <SelectItem value="loan_office">Loan Office (Legacy)</SelectItem>
                  <SelectItem value="hr_loan_office">HR Loan Office</SelectItem>
                  <SelectItem value="accounts_loan_office">Accounts Loan Office</SelectItem>
  <SelectItem value="hr_leave_office">HR Leave Office</SelectItem>
  <SelectItem value="hr_records">HR Records Office</SelectItem>
  <SelectItem value="manager_hr">Manager HR</SelectItem>
                  <SelectItem value="director_hr">Director HR</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="nsp">NSP</SelectItem>
                  <SelectItem value="intern">Intern</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="shadow-sm hover:shadow-md transition-shadow bg-transparent">
                    <Key className="mr-2 h-4 w-4" />
                    Reset Passwords
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="font-heading">Password Management</DialogTitle>
                    <DialogDescription>Reset passwords for staff members</DialogDescription>
                  </DialogHeader>
                  <PasswordManagement isAdmin={true} />
                </DialogContent>
              </Dialog>

              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="shadow-sm hover:shadow-md transition-shadow">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Staff
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="font-heading">Add New Staff Member</DialogTitle>
                    <DialogDescription>Create a new staff account for QCC</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="firstName" className="font-medium">
                          First Name
                        </Label>
                        <Input
                          id="firstName"
                          value={newStaff.first_name}
                          onChange={(e) => setNewStaff({ ...newStaff, first_name: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName" className="font-medium">
                          Last Name
                        </Label>
                        <Input
                          id="lastName"
                          value={newStaff.last_name}
                          onChange={(e) => setNewStaff({ ...newStaff, last_name: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="email" className="font-medium">
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={newStaff.email}
                        onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="password" className="font-medium">
                        Password
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        value={newStaff.password}
                        onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="employeeId" className="font-medium">
                        Employee ID
                      </Label>
                      <Input
                        id="employeeId"
                        value={newStaff.employee_id}
                        onChange={(e) => setNewStaff({ ...newStaff, employee_id: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="position" className="font-medium">
                        Position
                      </Label>
                    <Input
                      id="position"
                      value={newStaff.position}
                      onChange={(e) => {
                        const pos = e.target.value
                        // Auto-derive category from position text
                        const lower = pos.toLowerCase()
                        let derivedCategory = newStaff.staff_category || "Junior"
                        if (lower.includes("manager") || lower.includes("director")) derivedCategory = "Manager"
                        else if (lower.includes("senior") || lower.includes("principal")) derivedCategory = "Senior"
                        else if (lower.includes("officer")) derivedCategory = "Officer"
                        else if (pos.trim().length > 0) derivedCategory = "Junior"
                        setNewStaff({ ...newStaff, position: pos, staff_category: derivedCategory })
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newStaffCategory" className="font-medium">
                      Category
                      <span className="text-xs text-muted-foreground font-normal ml-1">(Auto-set from Position)</span>
                    </Label>
                    <Select
                      value={newStaff.staff_category || "Junior"}
                      onValueChange={(value) => setNewStaff({ ...newStaff, staff_category: value })}
                    >
                      <SelectTrigger id="newStaffCategory" className="mt-1">
                        <SelectValue placeholder="Select Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Senior">Senior</SelectItem>
                        <SelectItem value="Officer">Officer</SelectItem>
                        <SelectItem value="Junior">Junior</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Used for leave entitlement and payment advice grouping
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="department" className="font-medium">
                      Department
                    </Label>
                      <Select
                        value={newStaff.department_id}
                        onValueChange={(value) => setNewStaff({ ...newStaff, department_id: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select Department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((dept) => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="role" className="font-medium">
                        Role
                      </Label>
                      <Select
                        value={newStaff.role}
                        onValueChange={(value) => setNewStaff({ ...newStaff, role: value })}
                      >
                        <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {isItAdmin ? (
                              // IT-Admin may only create limited roles
                              <>
                                <SelectItem value="staff">Staff</SelectItem>
                                <SelectItem value="nsp">NSP</SelectItem>
                                <SelectItem value="contract">Contract</SelectItem>
                                <SelectItem value="department_head">Department Head</SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="staff">Staff</SelectItem>
                                <SelectItem value="audit_staff">Audit Staff</SelectItem>
                                <SelectItem value="department_head">Department Head</SelectItem>
                                {isAdministrator && <SelectItem value="regional_manager">Regional Manager</SelectItem>}
                                {isAdministrator && <SelectItem value="regional_hr">Regional HR Officer</SelectItem>}
                                {isAdministrator && <SelectItem value="accounts">Accounts</SelectItem>}
                                {isAdministrator && <SelectItem value="loan_office">Loan Office (Legacy)</SelectItem>}
                                {isAdministrator && <SelectItem value="hr_loan_office">HR Loan Office</SelectItem>}
                                {isAdministrator && <SelectItem value="accounts_loan_office">Accounts Loan Office</SelectItem>}
  {isAdministrator && <SelectItem value="hr_leave_office">HR Leave Office</SelectItem>}
  {isAdministrator && <SelectItem value="hr_records">HR Records Office</SelectItem>}
  {isAdministrator && <SelectItem value="manager_hr">Manager HR</SelectItem>}
                                {isAdministrator && <SelectItem value="director_hr">Director HR</SelectItem>}
                                {canManageStaffLinks && (
                                  <SelectItem value="it-admin">IT Admin</SelectItem>
                                )}
                                {isAdministrator && <SelectItem value="admin">Admin</SelectItem>}
                                {isAdministrator && <SelectItem value="managing_director">Managing Director</SelectItem>}
                                {isAdministrator && <SelectItem value="hr_executive">HR Executive</SelectItem>}
                                {isAdministrator && <SelectItem value="accounts_executive">Accounts Executive</SelectItem>}
                                {isAdministrator && <SelectItem value="secretary">Secretary</SelectItem>}
                                <SelectItem value="nsp">NSP</SelectItem>
                                <SelectItem value="intern">Intern</SelectItem>
                                <SelectItem value="contract">Contract</SelectItem>
                              </>
                            )}
                          </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="assignedLocation" className="font-medium">
                        Assigned Location
                      </Label>
                      <Select
                        value={newStaff.assigned_location_id}
                        onValueChange={(value) => setNewStaff({ ...newStaff, assigned_location_id: value })}
                        required
                      >
                        <SelectTrigger className="mt-1 border-2 border-primary/20">
                          <SelectValue placeholder="Select Location (Required)" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((location) => (
                            <SelectItem key={location.id} value={location.id}>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3 w-3" />
                                {location.name} - {location.address}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        Each staff member must be assigned to their actual work location for accurate attendance
                        tracking
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="dateOfAppointment" className="font-medium">
                        Date of Appointment <span className="text-muted-foreground font-normal">(Optional)</span>
                      </Label>
                      <Input
                        id="dateOfAppointment"
                        type="date"
                        value={newStaff.date_of_appointment}
                        onChange={(e) => {
                          const newDate = e.target.value
                          setNewStaff({
                            ...newStaff,
                            date_of_appointment: newDate,
                            years_of_service: String(calculateYearsOfService(newDate)),
                          })
                        }}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Years of service auto-calculates from this date</p>
                    </div>
                    <div>
                      <Label htmlFor="yearsOfService" className="font-medium">
                        Years of Service <span className="text-muted-foreground font-normal">(Auto-calculated)</span>
                      </Label>
                      <Input
                        id="yearsOfService"
                        type="number"
                        min="0"
                        step="1"
                        value={newStaff.years_of_service}
                        readOnly
                        disabled
                        className="mt-1 bg-muted"
                        placeholder="Calculated from appointment date"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Automatically calculated from date of appointment</p>
                    </div>
                    <div>
                      <Label htmlFor="contactNumber" className="font-medium">
                        Contact Number <span className="text-muted-foreground font-normal">(Optional)</span>
                      </Label>
                      <Input
                        id="contactNumber"
                        type="tel"
                        value={newStaff.contact_number}
                        onChange={(e) => setNewStaff({ ...newStaff, contact_number: e.target.value })}
                        className="mt-1"
                        placeholder="+233 123 456 7890"
                      />
                      <p className="text-xs text-muted-foreground mt-1">For leave and loan notifications</p>
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddStaff} className="shadow-sm">
                      Add Staff
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Edit Dialog */}
          {editingStaff && (
            <Dialog open={!!editingStaff} onOpenChange={() => setEditingStaff(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-heading">Edit Staff Member</DialogTitle>
                  <DialogDescription>Update staff member information and assignments</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="editFirstName" className="font-medium">
                        First Name
                      </Label>
                      <Input
                        id="editFirstName"
                        value={editingStaff.first_name || ""}
                        onChange={(e) => setEditingStaff({ ...editingStaff, first_name: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="editLastName" className="font-medium">
                        Last Name
                      </Label>
                      <Input
                        id="editLastName"
                        value={editingStaff.last_name || ""}
                        onChange={(e) => setEditingStaff({ ...editingStaff, last_name: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="editEmail" className="font-medium">
                      Email
                    </Label>
                    <Input
                      id="editEmail"
                      type="email"
                      value={editingStaff.email || ""}
                      onChange={(e) => setEditingStaff({ ...editingStaff, email: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="editEmployeeId" className="font-medium">
                      Employee ID
                    </Label>
                    <Input
                      id="editEmployeeId"
                      value={editingStaff.employee_id || ""}
                      onChange={(e) => setEditingStaff({ ...editingStaff, employee_id: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="editPosition" className="font-medium">
                      Position
                    </Label>
                    <Input
                      id="editPosition"
                      value={editingStaff.position || ""}
                      onChange={(e) => {
                        const pos = e.target.value
                        // Auto-derive category from position text
                        const lower = pos.toLowerCase()
                        let derivedCategory = editingStaff.staff_category || "Junior"
                        if (lower.includes("manager") || lower.includes("director")) derivedCategory = "Manager"
                        else if (lower.includes("senior") || lower.includes("principal")) derivedCategory = "Senior"
                        else if (lower.includes("officer")) derivedCategory = "Officer"
                        else if (pos.trim().length > 0) derivedCategory = "Junior"
                        setEditingStaff({ ...editingStaff, position: pos, staff_category: derivedCategory })
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="editStaffCategory" className="font-medium">
                      Category
                      <span className="text-xs text-muted-foreground font-normal ml-1">(Auto-set from Position)</span>
                    </Label>
                    <Select
  value={editingStaff.staff_category || "Junior"}
  onValueChange={(value) => setEditingStaff((current) => current ? { ...current, staff_category: value } : current)}

                    >
                      <SelectTrigger id="editStaffCategory" className="mt-1">
                        <SelectValue placeholder="Select Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Senior">Senior</SelectItem>
                        <SelectItem value="Officer">Officer</SelectItem>
                        <SelectItem value="Junior">Junior</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Used for leave entitlement and payment advice grouping
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="editDepartment" className="font-medium">
                      Department
                    </Label>
                    <Select
                      value={editingStaff.department_id || editingStaff.departments?.id || "none"}
                      onValueChange={(value) =>
                        setEditingStaff({
                          ...editingStaff,
                          department_id: value,
                          departments: departments.find((d) => d.id === value),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="editRole" className="font-medium">
                      Role
                    </Label>
                    <Select
                      value={editingStaff.role}
                      onValueChange={(value) => setEditingStaff({ ...editingStaff, role: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={editingStaff.role || "Select Role"} />
                      </SelectTrigger>
                      <SelectContent>
                        {isItAdmin ? (
                          <>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="nsp">NSP</SelectItem>
                            <SelectItem value="contract">Contract</SelectItem>
                            <SelectItem value="department_head">Department Head</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="audit_staff">Audit Staff</SelectItem>
                            <SelectItem value="department_head">Department Head</SelectItem>
                            {isAdministrator && <SelectItem value="regional_manager">Regional Manager</SelectItem>}
                            {isAdministrator && <SelectItem value="regional_hr">Regional HR Officer</SelectItem>}
                            {isAdministrator && <SelectItem value="accounts">Accounts</SelectItem>}
                            {isAdministrator && <SelectItem value="loan_office">Loan Office (Legacy)</SelectItem>}
                            {isAdministrator && <SelectItem value="hr_loan_office">HR Loan Office</SelectItem>}
                            {isAdministrator && <SelectItem value="accounts_loan_office">Accounts Loan Office</SelectItem>}
{isAdministrator && <SelectItem value="hr_leave_office">HR Leave Office</SelectItem>}
  {isAdministrator && <SelectItem value="hr_records">HR Records Office</SelectItem>}
  {isAdministrator && <SelectItem value="manager_hr">Manager HR</SelectItem>}
                            {isAdministrator && <SelectItem value="director_hr">Director HR</SelectItem>}
                            {canManageStaffLinks && (
                              <SelectItem value="it-admin">IT Admin</SelectItem>
                            )}
                            {isAdministrator && <SelectItem value="admin">Admin</SelectItem>}
                            {isAdministrator && <SelectItem value="managing_director">Managing Director</SelectItem>}
                            {isAdministrator && <SelectItem value="hr_executive">HR Executive</SelectItem>}
                            {isAdministrator && <SelectItem value="accounts_executive">Accounts Executive</SelectItem>}
                            {isAdministrator && <SelectItem value="secretary">Secretary</SelectItem>}
                            <SelectItem value="nsp">NSP</SelectItem>
                            <SelectItem value="intern">Intern</SelectItem>
                            <SelectItem value="contract">Contract</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="editAssignedLocation" className="font-medium">
                      Assigned Location
                    </Label>
                    <Select
                      value={editingStaff.assigned_location_id || "none"}
                      onValueChange={(value) => setEditingStaff({ ...editingStaff, assigned_location_id: value })}
                      required
                    >
                      <SelectTrigger className="border-2 border-primary/20">
                        <SelectValue placeholder="Select Location (Required)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" disabled>
                          <span className="text-muted-foreground">Select a location</span>
                        </SelectItem>
                        {locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate max-w-32" title={location.address}>
                                {location.name}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Staff must be assigned to their actual work location
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="editDateOfAppointment" className="font-medium">
                      Date of Appointment <span className="text-muted-foreground font-normal">(Optional)</span>
                    </Label>
                    <Input
                      id="editDateOfAppointment"
                      type="date"
                      value={editingStaff.date_of_appointment || ""}
                      onChange={(e) => {
                        const newDate = e.target.value
                        setEditingStaff({
                          ...editingStaff,
                          date_of_appointment: newDate,
                          years_of_service: String(calculateYearsOfService(newDate)),
                        })
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="editYearsOfService" className="font-medium">
                      Years of Service <span className="text-muted-foreground font-normal">(Auto-calculated)</span>
                    </Label>
                    <Input
                      id="editYearsOfService"
                      type="number"
                      min="0"
                      step="1"
                      value={editingStaff.years_of_service ?? ""}
                      readOnly
                      disabled
                      className="mt-1 bg-muted"
                    />
                  </div>
                  <div>
                    <Label htmlFor="editContactNumber" className="font-medium">
                      Contact Number <span className="text-muted-foreground font-normal">(Optional)</span>
                    </Label>
                    <Input
                      id="editContactNumber"
                      type="tel"
                      value={editingStaff.contact_number || ""}
                      onChange={(e) => setEditingStaff({ ...editingStaff, contact_number: e.target.value })}
                      className="mt-1"
                      placeholder="+233 123 456 7890"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingStaff(null)}>
                    Cancel
                  </Button>
                  {canManageStaffLinks && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const staff = editingStaff
                        setEditingStaff(null)
                        if (staff) openHodLinkDialog(staff)
                      }}
                    >
                      <Link2 className="mr-2 h-3 w-3" />
                      Link to HOD
                    </Button>
                  )}
                  <Button onClick={handleEditStaff}>Update Staff</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <div className="border-0 rounded-xl overflow-hidden shadow-sm bg-background/50">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50 border-border/50">
                  <TableHead className="font-semibold text-foreground">Name</TableHead>
                  <TableHead className="font-semibold text-foreground">Employee ID</TableHead>
                  <TableHead className="font-semibold text-foreground">Email</TableHead>
                  <TableHead className="font-semibold text-foreground">Department</TableHead>
                  <TableHead className="font-semibold text-foreground">Role</TableHead>
                  <TableHead className="font-semibold text-foreground">Assigned To (HOD)</TableHead>
                  <TableHead className="font-semibold text-foreground">Assigned Location</TableHead>
                  <TableHead className="font-semibold text-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-foreground">Last modified</TableHead>
                  <TableHead className="font-semibold text-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-muted-foreground font-medium">Loading staff...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : staff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <div className="space-y-2">
                        <Users className="h-12 w-12 text-muted-foreground mx-auto" />
                        <p className="text-muted-foreground font-medium">No staff members found</p>
                        <p className="text-sm text-muted-foreground">Try adjusting your search filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  staff.map((member) => (
                    <TableRow key={member.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-semibold">
                        {member.first_name} {member.last_name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{member.employee_id}</TableCell>
                      <TableCell className="text-sm">{member.email}</TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{member.departments?.name || "N/A"}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            member.role === "admin"
                              ? "default"
                              : member.role === "department_head"
                                ? "secondary"
                                : member.role === "audit_staff"
                                  ? "secondary"
                                  : member.role === "nsp"
                                    ? "default"
                                    : member.role === "intern"
                                      ? "outline"
                                      : member.role === "contract"
                                        ? "destructive"
                                        : "outline"
                          }
                          className="font-medium"
                        >
                          {member.role.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(member as any).hod_links && (member as any).hod_links.length > 0 ? (
                          <div className="space-y-1">
                            {(member as any).hod_links.map((hod: any, idx: number) => (
                              <div key={`${member.id}-hod-${idx}`} className="text-sm">
                                <div className="font-semibold text-primary">{hod.name}</div>
                                <div className="text-xs text-muted-foreground">{hod.role.replace("_", " ")}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not linked</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {member.geofence_locations ? (
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-32 font-medium" title={member.geofence_locations.address}>
                              {member.geofence_locations.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No location</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.is_active ? "default" : "destructive"} className="font-medium">
                          {member.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {member.last_modified_by ? (
                          <div className="text-sm">
                            <div className="font-medium">{member.last_modified_by.name}</div>
                            <div className="text-xs text-muted-foreground">{member.last_modified_by.role} • {new Date(member.last_modified_by.at).toLocaleString()}</div>
                          </div>
                        ) : member.updated_at ? (
                          <div className="text-sm text-muted-foreground">Updated • {new Date(member.updated_at).toLocaleString()}</div>
                        ) : (
                          <div className="text-sm text-muted-foreground">No recent changes</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingStaff({ ...member, role: displayRole(member.role) })}
                            className="h-8 w-8 p-0 hover:bg-primary/10 hover:border-primary/20"
                            disabled={
                              isItAdmin && (displayRole(member.role) === "admin" || displayRole(member.role) === "it-admin")
                            }
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateStaff(member.id, { is_active: !member.is_active })}
                            className="h-8 w-8 p-0 hover:bg-chart-2/10 hover:border-chart-2/20"
                          >
                            {member.is_active ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeactivateStaff(member.id)}
                            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:border-destructive/20"
                            disabled={
                              isItAdmin && (member.role === "admin" || member.role === "it-admin")
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          {canManageStaffLinks && (
                            <Button
                              size="sm"
                              variant="outline"
                              title={(member as any).hod_links?.length ? "Manage or deselect HOD assignments" : "Assign to HOD"}
                              aria-label={(member as any).hod_links?.length ? "Manage or deselect HOD assignments" : "Assign to HOD"}
                              onClick={() => openHodLinkDialog(member)}
                              className="h-8 w-8 p-0 hover:bg-blue-50 hover:border-blue-300"
                            >
                              {(member as any).hod_links?.length ? <Link2Off className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Simple pagination controls */}
            <div className="flex items-center justify-end gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Prev
              </Button>
              <div className="text-sm text-muted-foreground">Page {page} / {totalPages}</div>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

      {/* HOD Linkage Dialog */}
      <Dialog open={!!hodLinkStaff} onOpenChange={(open) => {
        if (!open) {
          setHodLinkStaff(null)
          setHodSearchQuery("")
          setHodLinkHodIds([])
          setHodLinkError(null)
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Staff HOD Assignments</DialogTitle>
            <DialogDescription>
              Select one or more Department Heads or Regional Managers for <strong>{hodLinkStaff?.first_name} {hodLinkStaff?.last_name}</strong>. Uncheck a selected HOD to remove that assignment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {hodLinkError && (
              <Alert variant="destructive"><AlertDescription>{hodLinkError}</AlertDescription></Alert>
            )}
            <div className="space-y-2.5">
              <Label htmlFor="hod-search" className="text-sm font-medium">Search HOD / Regional Manager</Label>
              <Input
                id="hod-search"
                placeholder="Search by name, staff ID, or department..."
                value={hodSearchQuery}
                onChange={(e) => setHodSearchQuery(e.target.value.toLowerCase())}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">
                {hodCandidates.length > 0
                  ? `Found ${hodCandidates.filter((h) => 
                      `${h.first_name} ${h.last_name}`.toLowerCase().includes(hodSearchQuery) ||
                      (h.employee_id && h.employee_id.includes(hodSearchQuery)) ||
                      (h.departments?.name && h.departments.name.toLowerCase().includes(hodSearchQuery))
                    ).length} of ${hodCandidates.length} HODs`
                  : "No HODs available"}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select HODs (can choose multiple)</Label>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                {hodCandidates.filter((h) =>
                  hodSearchQuery === "" ||
                  `${h.first_name} ${h.last_name}`.toLowerCase().includes(hodSearchQuery) ||
                  (h.employee_id && h.employee_id.includes(hodSearchQuery)) ||
                  (h.departments?.name && h.departments.name.toLowerCase().includes(hodSearchQuery))
                ).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-4 text-center">
                    {hodSearchQuery ? "No matching HODs found" : "No HODs available"}
                  </p>
                ) : (
                  hodCandidates.filter((h) =>
                    hodSearchQuery === "" ||
                    `${h.first_name} ${h.last_name}`.toLowerCase().includes(hodSearchQuery) ||
                    (h.employee_id && h.employee_id.includes(hodSearchQuery)) ||
                    (h.departments?.name && h.departments.name.toLowerCase().includes(hodSearchQuery))
                  ).map((hod) => (
                    <div key={hod.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer">
                      <input
                        type="checkbox"
                        id={`hod-${hod.id}`}
                        checked={hodLinkHodIds.includes(hod.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setHodLinkHodIds([...hodLinkHodIds, hod.id])
                          } else {
                            setHodLinkHodIds(hodLinkHodIds.filter((id) => id !== hod.id))
                          }
                        }}
                        className="h-4 w-4 rounded"
                      />
                      <label htmlFor={`hod-${hod.id}`} className="flex-1 cursor-pointer text-sm">
                        <div className="font-medium">{hod.first_name} {hod.last_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {hod.employee_id && `ID: ${hod.employee_id} • `}
                          {hod.role.replace("_", " ")} {hod.departments?.name ? `• ${hod.departments.name}` : ""}
                        </div>
                      </label>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {hodLinkHodIds.length > 0 ? `Selected: ${hodLinkHodIds.length} HOD(s)` : "No HOD assignments selected"}
                </p>
                {hodLinkHodIds.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setHodLinkHodIds([])}>
                    Clear all
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHodLinkStaff(null)}>Cancel</Button>
            <Button onClick={handleHodLink} disabled={hodLinkLoading}>
              {hodLinkLoading ? "Saving..." : "Save assignments"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

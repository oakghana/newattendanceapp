"use client"

import { useState, useEffect, useCallback } from "react"
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
import { ManageHODLinkagesModal } from "./manage-hod-linkages-modal"

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
  const canonicalRole = (role: string | null | undefined) => {
    const normalized = String(role || "").toLowerCase().trim()
    return normalized === "hr_office" ? "hr_leave_office" : normalized
  }

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
    role: "staff",
    assigned_location_id: "",
    date_of_appointment: "",
    years_of_service: "",
    contact_number: "",
  })

  const [currentUserRole, setCurrentUserRole] = useState<string>("staff")
  const [currentUserLocationId, setCurrentUserLocationId] = useState<string | null>(null)

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
          ? result.data.map((row: StaffMember) => ({ ...row, role: canonicalRole(row.role) }))
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
          role: "staff",
          assigned_location_id: "",
          date_of_appointment: "",
          years_of_service: "",
          contact_number: "",
        })
        fetchStaff()
        // Auto-open HOD linkage dialog after creating staff (admin / it-admin)
        if ((currentUserRole === "admin" || currentUserRole === "it-admin") && result.data) {
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

      if (result.success) {
        showSuccess("Staff member updated successfully", "Staff Updated")
        setSuccess("Staff member updated successfully")

        // Immediately update the local staff array so the table shows fresh data
        const updatedMember: StaffMember = result.data ?? { ...editingStaff, ...updateData }
        setStaff((prev) =>
          prev.map((s) =>
            s.id === editingStaff.id
              ? { ...s, ...updatedMember, role: canonicalRole(updatedMember.role ?? s.role) }
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
    setHodLinkHodIds([])
    setHodLinkError(null)
    try {
      // Fetch all roles that act as head of department in parallel
      const [resDH, resRM, resMHR, resDHR, resHodLinks] = await Promise.all([
        authenticatedFetch("/api/admin/staff?role=department_head&limit=200"),
        authenticatedFetch("/api/admin/staff?role=regional_manager&limit=200"),
        authenticatedFetch("/api/admin/staff?role=manager_hr&limit=200"),
        authenticatedFetch("/api/admin/staff?role=director_hr&limit=200"),
        authenticatedFetch(`/api/loan/hod-linkages?staff_id=${member.id}`),
      ])
      const [dh, rm, mhr, dhr, hodLinksData]: any[] = await Promise.all([
        resDH.json().then((d: any) => d.data || []),
        resRM.json().then((d: any) => d.data || []),
        resMHR.json().then((d: any) => d.data || []),
        resDHR.json().then((d: any) => d.data || []),
        resHodLinks.json(),
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
      
      // Update staff member with HOD links data
      if (hodLinksData?.linkedHods && hodLinksData.linkedHods.length > 0) {
        setHodLinkStaff((prev) => 
          prev ? { ...prev, hod_links: hodLinksData.linkedHods } : null
        )
      }
    } catch {
      setHodCandidates([])
    }
  }

  const handleHodLink = async () => {
    if (!hodLinkStaff || hodLinkHodIds.length === 0) return
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
        showSuccess(`${hodLinkStaff.first_name} ${hodLinkStaff.last_name} linked to ${count} HOD(s) successfully`, "HOD Linked")
        // Refresh staff data to show updated HOD linkage
        await fetchStaff()
        setHodLinkStaff(null)
        setHodLinkHodIds([])
        setHodLinkError(null)
      } else {
        setHodLinkError(result.error || "Failed to link")
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
                  <SelectItem value="loan_office">Loan Office</SelectItem>
                  <SelectItem value="hr_leave_office">HR Leave Office</SelectItem>
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
                        onChange={(e) => setNewStaff({ ...newStaff, position: e.target.value })}
                        className="mt-1"
                      />
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
                            {currentUserRole === "it-admin" ? (
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
                                {currentUserRole === "admin" && <SelectItem value="regional_manager">Regional Manager</SelectItem>}
                                {currentUserRole === "admin" && <SelectItem value="regional_hr">Regional HR Officer</SelectItem>}
                                {currentUserRole === "admin" && <SelectItem value="accounts">Accounts</SelectItem>}
                                {currentUserRole === "admin" && <SelectItem value="loan_office">Loan Office</SelectItem>}
                                {currentUserRole === "admin" && <SelectItem value="hr_leave_office">HR Leave Office</SelectItem>}
                                {currentUserRole === "admin" && <SelectItem value="manager_hr">Manager HR</SelectItem>}
                                {currentUserRole === "admin" && <SelectItem value="director_hr">Director HR</SelectItem>}
                                {(currentUserRole === "admin" || currentUserRole === "it-admin") && (
                                  <SelectItem value="it-admin">IT Admin</SelectItem>
                                )}
                                {currentUserRole === "admin" && <SelectItem value="admin">Admin</SelectItem>}
                                {currentUserRole === "admin" && <SelectItem value="managing_director">Managing Director</SelectItem>}
                                {currentUserRole === "admin" && <SelectItem value="hr_executive">HR Executive</SelectItem>}
                                {currentUserRole === "admin" && <SelectItem value="accounts_executive">Accounts Executive</SelectItem>}
                                {currentUserRole === "admin" && <SelectItem value="secretary">Secretary</SelectItem>}
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
                      onValueChange={(value) => setEditingStaff({ ...editingStaff, staff_category: value })}
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
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currentUserRole === "it-admin" ? (
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
                            {currentUserRole === "admin" && <SelectItem value="regional_manager">Regional Manager</SelectItem>}
                            {currentUserRole === "admin" && <SelectItem value="regional_hr_officer">Regional HR Officer</SelectItem>}
                            {currentUserRole === "admin" && <SelectItem value="accounts">Accounts</SelectItem>}
                            {currentUserRole === "admin" && <SelectItem value="loan_office">Loan Office</SelectItem>}
                            {currentUserRole === "admin" && <SelectItem value="hr_leave_office">HR Leave Office</SelectItem>}
                            {currentUserRole === "admin" && <SelectItem value="manager_hr">Manager HR</SelectItem>}
                            {currentUserRole === "admin" && <SelectItem value="director_hr">Director HR</SelectItem>}
                            {(currentUserRole === "admin" || currentUserRole === "it-admin") && (
                              <SelectItem value="it-admin">IT Admin</SelectItem>
                            )}
                            {currentUserRole === "admin" && <SelectItem value="admin">Admin</SelectItem>}
                            {currentUserRole === "admin" && <SelectItem value="managing_director">Managing Director</SelectItem>}
                            {currentUserRole === "admin" && <SelectItem value="hr_executive">HR Executive</SelectItem>}
                            {currentUserRole === "admin" && <SelectItem value="accounts_executive">Accounts Executive</SelectItem>}
                            {currentUserRole === "admin" && <SelectItem value="secretary">Secretary</SelectItem>}
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
                  {(currentUserRole === "admin" || currentUserRole === "it-admin") && (
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
                            onClick={() => setEditingStaff({ ...member, role: canonicalRole(member.role) })}
                            className="h-8 w-8 p-0 hover:bg-primary/10 hover:border-primary/20"
                            disabled={
                              currentUserRole === "it-admin" && (member.role === "admin" || member.role === "it-admin")
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
                              currentUserRole === "it-admin" && (member.role === "admin" || member.role === "it-admin")
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          {(currentUserRole === "admin" || currentUserRole === "it-admin") && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                title="Link to HOD"
                                onClick={() => openHodLinkDialog(member)}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:border-blue-300"
                              >
                                <Link2 className="h-3 w-3" />
                              </Button>
                              {/* Deselect HOD button - only show when HODs are linked */}
                              {(member as any).hod_links && (member as any).hod_links.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Manage or remove linked HODs"
                                  onClick={() => openHodLinkDialog(member)}
                                  className="h-8 w-8 p-0 hover:bg-amber-50 hover:border-amber-300"
                                >
                                  <Link2Off className="h-3 w-3 text-amber-600" />
                                </Button>
                              )}
                            </>
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

      {/* HOD Linkage Management Modal - now supports add and remove */}
      <ManageHODLinkagesModal
        open={!!hodLinkStaff}
        onOpenChange={(open) => {
          if (!open) {
            setHodLinkStaff(null)
            setHodSearchQuery("")
            setHodLinkHodIds([])
            setHodLinkError(null)
          }
        }}
        staffMember={hodLinkStaff ? {
          id: hodLinkStaff.id,
          first_name: hodLinkStaff.first_name,
          last_name: hodLinkStaff.last_name,
          email: hodLinkStaff.email || '',
        } : null}
        currentLinks={(hodLinkStaff as any)?.hod_links?.map((hod: any) => ({
          id: hod.id,
          name: hod.name || `${hod.first_name || ''} ${hod.last_name || ''}`.trim() || 'Unknown HOD',
          employee_id: hod.employee_id || '',
          role: hod.role,
          department: hod.department || hod.departments?.name || '',
        })) || []}
        availableHODs={hodCandidates.map((hod: any) => ({
          id: hod.id,
          name: `${hod.first_name} ${hod.last_name}`,
          employee_id: hod.employee_id || '',
          role: hod.role,
          department: hod.departments?.name || '',
        }))}
        onAddLink={async (hodId: string) => {
          setHodLinkHodIds([...hodLinkHodIds, hodId])
          await handleHodLink()
        }}
        onRemoveLink={async (hodId: string) => {
          // Call the delink API
          try {
            const response = await authenticatedFetch('/api/admin/delink-hod', {
              method: 'POST',
              body: JSON.stringify({
                staff_user_id: hodLinkStaff?.id,
                hod_user_id: hodId,
              }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Failed to delink HOD')
            
            // Refresh the staff data
            await fetchStaff()
            showSuccess('HOD removed and requests withdrawn.', 'HOD Successfully Delinked')
          } catch (error) {
            showError(String(error), 'Delink Failed')
            throw error
          }
        }}
        loading={hodLinkLoading}
      />
    </>
  )
}

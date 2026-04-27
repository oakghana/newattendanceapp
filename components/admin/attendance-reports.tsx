"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Download, CalendarIcon, Users, Clock, FileText, AlertTriangle, CheckCircle, FileSpreadsheet, MapPin, Loader2, Search, Eye, User, AlertCircle, BarChart3, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts"
import { createClient } from "@/lib/supabase/client"

interface AttendanceRecord {
  id: string
  user_id?: string
  google_maps_name?: string
  check_in_time: string
  check_out_time?: string
  work_hours?: number
  status: string
  check_in_location_name?: string
  check_out_location_name?: string
  is_check_in_outside_location?: boolean
  is_check_out_outside_location?: boolean
  early_checkout_reason?: string
  lateness_reason?: string
  notes?: string
  user_profiles?: {
    first_name?: string
    last_name?: string
    employee_id?: string
    departments?: {
      id?: string
      name?: string
      code?: string
    }
    assigned_location?: {
      name?: string
      address?: string
    }
    districts?: {
      id?: string
      name?: string
    }
  }
  check_in_location?: {
    id: string
    name: string
    address: string
  }
  check_out_location?: {
    id: string
    name: string
    address: string
  }
  geofence_locations?: {
    name: string
    address: string
  }
}

interface ReportSummary {
  totalRecords: number
  totalWorkHours: number
  averageWorkHours: number
  statusCounts: Record<string, number>
  departmentStats: Record<string, { count: number; totalHours: number }>
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
}

interface District {
  id: string
  name: string
}

const COLORS = ["#4B8B3B", "#8B5CF6", "#6b7280", "#f97316", "#ea580c"]

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

export function AttendanceReports() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [compactMode, setCompactMode] = useState(false) // compact / landscape view for mobile

  // Current user context (role + assigned location)
  const [currentUserRole, setCurrentUserRole] = useState<string>("staff")
  const [currentUserLocationId, setCurrentUserLocationId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  
  // Auto-enable compact mode on small screens for denser layout
  useEffect(() => {
    const checkCompact = () => setCompactMode(window.innerWidth <= 768)
    if (typeof window !== 'undefined') {
      checkCompact()
      window.addEventListener('resize', checkCompact)
    }
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('resize', checkCompact)
    }
  }, [])

  // Fetch current user role and location on mount
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const res = await authenticatedFetch("/api/auth/current-user")
        const data = await res.json()
        if (res.ok && data.success && data.user) {
          setCurrentUserRole(data.user.role)
          if (data.user.assigned_location_id) {
            setCurrentUserLocationId(data.user.assigned_location_id)
          }
          setIsAuthenticated(true)
        } else if (res.status === 401) {
          // Try a silent token refresh then retry once
          const supabase = createClient()
          await supabase.auth.refreshSession()
          const retry = await authenticatedFetch("/api/auth/current-user")
          const retryData = await retry.json()
          if (retry.ok && retryData.success && retryData.user) {
            setCurrentUserRole(retryData.user.role)
            if (retryData.user.assigned_location_id) {
              setCurrentUserLocationId(retryData.user.assigned_location_id)
            }
            setIsAuthenticated(true)
          } else {
            setIsAuthenticated(false)
            setExportError("Your session has expired. Please sign in again.")
          }
        } else {
          setIsAuthenticated(false)
          setExportError(data.error || "Your session has expired. Please sign in again.")
        }
      } catch (err) {
        console.error("[v0] AttendanceReports - Failed to fetch current user:", err)
        setIsAuthenticated(false)
        setExportError("Unable to verify your session. Please sign in again.")
      } finally {
        setAuthChecked(true)
      }
    }
    fetchCurrentUser()
  }, [])

  const [startDate, setStartDate] = useState(() => {
    const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    return date.toISOString().split("T")[0]
  })
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0]
  })
  const [selectedDepartment, setSelectedDepartment] = useState("all")
  const [locations, setLocations] = useState<Location[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [selectedLocation, setSelectedLocation] = useState("all")
  const [selectedDistrict, setSelectedDistrict] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortKey, setSortKey] = useState<string>("check_in_time")
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [colFilter, setColFilter] = useState({
    employee: '',
    department: '',
    checkInLocation: '',
    checkOutLocation: '',
    status: 'all',
    hoursMin: '',
    hoursMax: '',
  })

  const setCol = (key: keyof typeof colFilter, val: string) =>
    setColFilter((prev) => ({ ...prev, [key]: val }))

  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const [totalRecords, setTotalRecords] = useState<number>(0)
  const [reasonsPage, setReasonsPage] = useState<number>(1)
  const reasonsPageSize = 20
  const [earlyPage, setEarlyPage] = useState<number>(1)
  const earlyPageSize = 20
  const [activeTab, setActiveTab] = useState<string>("details")
  const [reasonsRecords, setReasonsRecords] = useState<AttendanceRecord[]>([])
  const [reasonsLoading, setReasonsLoading] = useState<boolean>(false)

  const visibleColumnCount = 9

  // Helper to safely format user display values when user_profiles may be missing.
  // Prefer explicit name fields (first + last), then common full-name variants,
  // then employee_id, then email, then fallback to a short user id marker.
  const extractFullNameFromProfile = (p: AttendanceRecord["user_profiles"] | null | undefined) => {
    if (!p) return null
    const first = (p as any).first_name || null
    const last = (p as any).last_name || null
    if (first || last) return `${first || ''} ${last || ''}`.trim()
    // Some profiles may store a single full name field
    const full = (p as any).full_name || (p as any).name || (p as any).display_name || null
    if (full) return String(full).trim()
    // fallback to email if present
    if ((p as any).email) return String((p as any).email)
    return null
  }

  const userInitials = (p: AttendanceRecord["user_profiles"] | null | undefined) => {
    const full = extractFullNameFromProfile(p)
    if (!full) return "??"
    const parts = full.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0] || '?'}${parts[parts.length - 1][0] || '?'}`.toUpperCase()
  }

  const displayUserLabel = (record: AttendanceRecord) => {
    const p = record.user_profiles
    const name = extractFullNameFromProfile(p)
    if (name) return name
    if (p?.employee_id) return p.employee_id
    // Try to extract name from email (e.g. john.doe@company.com -> John Doe)
    const email = (p as any)?.email
    if (email) {
      const localPart = email.split('@')[0]
      const nameParts = localPart.split(/[._-]/).filter(Boolean)
      if (nameParts.length >= 2) {
        return nameParts.map((s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' ')
      }
      return localPart.charAt(0).toUpperCase() + localPart.slice(1)
    }
    // For records without a profile, show location-based label
    const location = record.check_in_location?.name || record.check_in_location_name || record.geofence_locations?.name
    if (location) return `Staff at ${location}`
    if (record.user_id) return `Staff (ID: ${record.user_id.slice(0, 8)})`
    return 'Unknown Staff'
  }


  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [analyticsData, setAnalyticsData] = useState({
    dailyTrends: [],
    departmentComparison: [],
    lateArrivals: [],
    overtime: [],
    absenteeism: [],
  })

  const [departments, setDepartments] = useState<Department[]>([])

  const getLocationLabel = (record: AttendanceRecord, which: 'in' | 'out' = 'in') => {
    if (which === 'in') {
      return (
        (record.google_maps_name && record.is_check_in_outside_location && record.google_maps_name) ||
        record.check_in_location_name ||
        record.check_in_location?.name ||
        record.geofence_locations?.name ||
        'N/A'
      )
    }

    return (
      record.check_out_location?.name || record.check_out_location_name || record.check_in_location_name || record.geofence_locations?.name || 'N/A'
    )
  }

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return

    fetchReport()
    fetchDepartments()
    fetchLocations()
    fetchDistricts()
  }, [authChecked, isAuthenticated, startDate, endDate, selectedDepartment, selectedLocation, selectedDistrict, selectedStatus, page, pageSize])

  useEffect(() => {
    // When the Reasons tab is opened, fetch a larger set that contains all reason entries
    if (!authChecked || !isAuthenticated) return

    if (activeTab === "reasons") {
      fetchReasons()
    }
  }, [authChecked, isAuthenticated, activeTab, startDate, endDate, selectedLocation, selectedDepartment, selectedDistrict])

  const fetchReasons = async () => {
    if (!isAuthenticated) return

    setReasonsLoading(true)
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        page: "1",
        page_size: String(1000),
      })

      if (selectedDepartment !== "all") params.append("department_id", selectedDepartment)
      if (selectedLocation !== "all") params.append("location_id", selectedLocation)
      if (selectedDistrict !== "all") params.append("district_id", selectedDistrict)

      const res = await authenticatedFetch(`/api/admin/reports/attendance?${params}`)
      const json = await res.json()

      if (res.status === 401) {
        console.error("Failed to fetch reasons:", json.error)
        setExportError("Your session has expired. Please sign in again.")
        setReasonsRecords([])
        return
      }

      if (json.success) {
        let fetchedRecords: AttendanceRecord[] = json.data.records || []

        // Proactively re-fetch profiles for ALL users who appear in reason records.
        // This guarantees real name data regardless of what the API returned.
        const reasonUserIds = [
          ...new Set(
            fetchedRecords
              .filter((r) => r.lateness_reason || r.early_checkout_reason)
              .map((r) => r.user_id)
              .filter(Boolean)
          ),
        ]

        if (reasonUserIds.length > 0) {
          const supabase = createClient()
          const { data: profiles } = await supabase
            .from("user_profiles")
            .select(`
              id,
              first_name,
              last_name,
              email,
              employee_id,
              department_id,
              assigned_location_id,
              departments ( id, name, code ),
              assigned_location:geofence_locations!assigned_location_id ( id, name, address )
            `)
            .in("id", reasonUserIds)

          if (profiles && profiles.length > 0) {
            const profileMap = new Map(profiles.map((p: any) => [p.id, p]))
            fetchedRecords = fetchedRecords.map((r) => {
              const found = profileMap.get(r.user_id)
              // Always override with the freshly fetched profile if available,
              // so that names are always up-to-date on the reasons cards
              if (found) return { ...r, user_profiles: found }
              return r
            })
          }
        }

        setReasonsRecords(fetchedRecords)
      } else {
        console.error("Failed to fetch reasons:", json.error)
      }
    } catch (err) {
      console.error("Failed to fetch reasons:", err)
    } finally {
      setReasonsLoading(false)
    }
  }

  const fetchReport = async () => {
    if (!isAuthenticated) return

    setLoading(true)
    setExportError(null)
    try {
      console.log("[v0] Fetching report with dates:", startDate, endDate)

      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      })

      if (selectedDepartment !== "all") params.append("department_id", selectedDepartment)
      if (selectedLocation !== "all") params.append("location_id", selectedLocation)
      if (selectedDistrict !== "all") params.append("district_id", selectedDistrict)
      if (selectedStatus !== "all") params.append("status", selectedStatus)
      // Pagination params
      params.append("page", String(page))
      params.append("page_size", String(pageSize))

      console.log("[v0] API call URL:", `/api/admin/reports/attendance?${params}`)

      const response = await authenticatedFetch(`/api/admin/reports/attendance?${params}`)
      const result = await response.json()

      if (response.status === 401) {
        console.error("[v0] API error:", result.error)
        setExportError("Your session has expired. Please sign in again.")
        setRecords([])
        setSummary(null)
        return
      }

      console.log("[v0] API response:", result)

      if (result.success) {
        setRecords(result.data.records || [])
        setSummary(result.data.summary || null)
        setTotalRecords(result.data.summary?.totalRecords || 0)
        console.log("[v0] Successfully loaded", result.data.records?.length || 0, "records (page)")
      } else {
        console.error("[v0] API error:", result.error)
        setExportError(result.error || "Failed to fetch report data")
      }
    } catch (error) {
      console.error("[v0] Failed to fetch report:", error)
      setExportError("Failed to fetch report data. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const fetchDepartments = async () => {
    try {
      console.log("[v0] Fetching departments...")
      const response = await authenticatedFetch("/api/admin/departments")
      const result = await response.json()
      console.log("[v0] Departments response:", result)

      if (result.success) {
        setDepartments(result.data || [])
      } else {
        console.error("[v0] Departments error:", result.error)
      }
    } catch (error) {
      console.error("[v0] Failed to fetch departments:", error)
    }
  }

  // users list removed — Employee filter omitted per requirements

  const fetchLocations = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("geofence_locations")
        .select("id, name, address")
        .eq("is_active", true)
        .order("name")

      if (error) throw error
      setLocations(data || [])
    } catch (error) {
      console.error("Failed to fetch locations:", error)
    }
  }

  const fetchDistricts = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from("districts").select("id, name").eq("is_active", true).order("name")

      if (error) throw error
      setDistricts(data || [])
    } catch (error) {
      console.error("Failed to fetch districts:", error)
    }
  }

  const fetchAllRecordsForExport = async (): Promise<AttendanceRecord[]> => {
    // Paginate through ALL matching records in chunks of 1000 to bypass Supabase's row limit
    const PAGE_SIZE = 1000
    const allRecords: AttendanceRecord[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        export: "true",
        page: String(page),
        page_size: String(PAGE_SIZE),
      })

      if (selectedDepartment !== "all") params.append("department_id", selectedDepartment)
      if (selectedLocation !== "all") params.append("location_id", selectedLocation)
      if (selectedDistrict !== "all") params.append("district_id", selectedDistrict)
      if (selectedStatus !== "all") params.append("status", selectedStatus)

      const res = await authenticatedFetch(`/api/admin/reports/attendance?${params}`)
      const json = await res.json()

      if (!json.success) {
        throw new Error(json.error || "Failed to fetch records for export")
      }

      const batch: AttendanceRecord[] = json.data.records || []
      allRecords.push(...batch)

      // If the batch is smaller than PAGE_SIZE we've reached the last page
      hasMore = batch.length === PAGE_SIZE
      page++

      // Safety: stop if we somehow exceed 100k records to avoid infinite loops
      if (allRecords.length >= 100000) break
    }

    return allRecords
  }

  const exportReport = async (format: "excel" | "pdf" | "csv") => {
    setExporting(true)
    setExportError(null)

    try {
      console.log(`[v0] Starting ${format} export...`)

      // Always fetch the full dataset (not just the current page) for export
      const allRecords = await fetchAllRecordsForExport()
      const exportRecords = applyClientFilters(allRecords)
      console.log(`[v0] Fetched ${allRecords.length} total records for export, ${exportRecords.length} after client-side filtering`)

      if (format === "csv") {
        const csvContent = [
          [
            "Date",
            "Employee ID",
            "Name",
            "Department",
            "Assigned Location",
            "Check In Time",
            "Check In Location",
            "Check In Status",
            "Check Out Time",
            "Check Out Location",
            "Check Out Status",
            "Early Checkout Reason",
            "Early Checkout Provided By",
            "Lateness Reason",
            "Lateness Provided By",
            "Work Hours",
            "Status",
            "Location Status",
          ].join(","),
          ...exportRecords.map((record) => {
              const checkInLabel = record.google_maps_name && record.is_check_in_outside_location
                ? record.google_maps_name
                : record.check_in_location?.name || record.check_in_location_name || "N/A"

              const checkOutLabel = record.check_out_location?.name || record.check_out_location_name || record.check_in_location_name || "N/A"

              const row = [
                new Date(record.check_in_time).toLocaleDateString(),
                `"${record.user_profiles?.employee_id || "N/A"}"`,
                `"${(record.user_profiles?.first_name || "") + (record.user_profiles?.last_name ? ' ' + record.user_profiles.last_name : '') || 'Unknown User'}"`,
                `"${record.user_profiles?.departments?.name || "N/A"}"`,
                `"${record.user_profiles?.assigned_location?.name || "N/A"}"`,
                `"${new Date(record.check_in_time).toLocaleTimeString()}"`,
                `"${checkInLabel}"`,
                `"${record.is_check_in_outside_location ? "Outside Assigned Location" : "On-site"}"`,
                `"${record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : "N/A"}"`,
                `"${checkOutLabel}"`,
                `"${record.is_check_out_outside_location ? "Outside Assigned Location" : "On-site"}"`,
                `"${record.early_checkout_reason || "-"}"`,
                `"${record.early_checkout_proved_by || "-"}"`,
                `"${record.lateness_reason || "-"}"`,
                `"${record.lateness_proved_by || "-"}"`,
                record.work_hours?.toFixed(2) || "0",
                `"${record.status}"`,
                `"${record.is_check_in_outside_location || record.is_check_out_outside_location ? "Remote Work" : "On-site"}"`,
              ]
              return row.join(",")
            }),
        ].join("\n")

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `qcc-attendance-report-${startDate}-to-${endDate}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        console.log("[v0] CSV export completed successfully")
      } else if (format === "excel") {
        // Build Excel client-side from all enriched records (full dataset, not just current page)
        const XLSX = await import("xlsx")

        const sheetData = [
          [
            "Date",
            "Employee ID",
            "Name",
            "Department",
            "Assigned Location",
            "Check In Time",
            "Check In Location",
            "Check In Status",
            "Check Out Time",
            "Check Out Location",
            "Check Out Status",
            "Early Checkout Reason",
            "Early Checkout Provided By",
            "Lateness Reason",
            "Lateness Provided By",
            "Work Hours",
            "Status",
            "Location Status",
          ],
          ...exportRecords.map((record) => {
            const checkInLabel = record.google_maps_name && record.is_check_in_outside_location
              ? record.google_maps_name
              : record.check_in_location?.name || record.check_in_location_name || "N/A"

            const checkOutLabel =
              record.check_out_location?.name || record.check_out_location_name || record.check_in_location_name || "N/A"

            const firstName = record.user_profiles?.first_name || ""
            const lastName = record.user_profiles?.last_name || ""
            const fullName = (firstName + (lastName ? " " + lastName : "")).trim() || "Unknown User"

            return [
              new Date(record.check_in_time).toLocaleDateString(),
              record.user_profiles?.employee_id || "N/A",
              fullName,
              record.user_profiles?.departments?.name || "N/A",
              record.user_profiles?.assigned_location?.name || "N/A",
              new Date(record.check_in_time).toLocaleTimeString(),
              checkInLabel,
              record.is_check_in_outside_location ? "Outside Assigned Location" : "On-site",
              record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : "Not checked out",
              checkOutLabel,
              record.is_check_out_outside_location ? "Outside Assigned Location" : "On-site",
              record.early_checkout_reason || "-",
              record.early_checkout_proved_by || "-",
              record.lateness_reason || "-",
              record.lateness_proved_by || "-",
              record.work_hours != null ? Number(record.work_hours.toFixed(2)) : 0,
              record.status ? record.status.charAt(0).toUpperCase() + record.status.slice(1) : "N/A",
              record.is_check_in_outside_location || record.is_check_out_outside_location ? "Remote Work" : "On-site",
            ]
          }),
        ]

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(sheetData)

        // Column widths matching the detailed view columns
        ws["!cols"] = [
          { wch: 12 }, // Date
          { wch: 14 }, // Employee ID
          { wch: 24 }, // Name
          { wch: 18 }, // Department
          { wch: 28 }, // Assigned Location
          { wch: 14 }, // Check In Time
          { wch: 28 }, // Check In Location
          { wch: 22 }, // Check In Status
          { wch: 16 }, // Check Out Time
          { wch: 28 }, // Check Out Location
          { wch: 22 }, // Check Out Status
          { wch: 30 }, // Early Checkout Reason
          { wch: 22 }, // Early Checkout Provided By
          { wch: 30 }, // Lateness Reason
          { wch: 22 }, // Lateness Provided By
          { wch: 12 }, // Work Hours
          { wch: 12 }, // Status
          { wch: 16 }, // Location Status
        ]

        XLSX.utils.book_append_sheet(wb, ws, "Attendance Report")

        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" })
        const blob = new Blob([wbout], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `qcc-attendance-report-${startDate}-to-${endDate}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        console.log("[v0] Excel export completed successfully")
      } else {
        // PDF export via server
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 120000)

        try {
          const response = await authenticatedFetch("/api/admin/reports/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              format,
              data: exportRecords,
              summary,
              filters: {
                startDate,
                endDate,
                locationId: selectedLocation !== "all" ? selectedLocation : null,
                districtId: selectedDistrict !== "all" ? selectedDistrict : null,
                departmentId: selectedDepartment !== "all" ? selectedDepartment : null,
                reportType: "attendance",
              },
            }),
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`[v0] Export API error:`, errorText)
            throw new Error(`Export failed: ${response.status} ${response.statusText}`)
          }

          const blob = await response.blob()
          if (blob.size === 0) throw new Error("Export returned empty file")

          const url = window.URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = `qcc-attendance-report-${startDate}-to-${endDate}.pdf`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          window.URL.revokeObjectURL(url)
          console.log(`[v0] PDF export completed successfully`)
        } catch (error) {
          clearTimeout(timeoutId)
          throw error
        }
      }
    } catch (error) {
      console.error("[v0] Export error:", error)
      if (error instanceof Error && error.name === "AbortError") {
        setExportError("Export timed out. Please try again with a smaller date range.")
      } else {
        setExportError(`Failed to export ${format.toUpperCase()} report: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } finally {
      setExporting(false)
    }
  }

  const statusChartData = useMemo(
    () =>
      summary?.statusCounts
        ? Object.entries(summary.statusCounts).map(([status, count]) => ({
            name: status.charAt(0).toUpperCase() + status.slice(1),
            value: count,
          }))
        : [],
    [summary?.statusCounts],
  )

  const departmentChartData = useMemo(
    () =>
      summary?.departmentStats
        ? Object.entries(summary.departmentStats).map(([dept, stats]) => ({
            name: dept,
            count: stats.count,
            hours: stats.totalHours,
          }))
        : [],
    [summary?.departmentStats],
  )

  const applyClientFilters = (inputRecords: AttendanceRecord[]) => {
    let filtered = inputRecords

    // Department filter
    if (selectedDepartment !== "all") {
      filtered = filtered.filter((r) => r.user_profiles?.departments?.id === selectedDepartment)
    }

    // Location filter
    if (selectedLocation !== "all") {
      filtered = filtered.filter(
        (r) => r.check_in_location?.id === selectedLocation || r.check_out_location?.id === selectedLocation,
      )
    }

    // District filter
    if (selectedDistrict !== "all") {
      filtered = filtered.filter((r) => r.user_profiles?.assigned_location?.districts?.id === selectedDistrict)
    }

    // Status filter
    if (selectedStatus !== "all") {
      filtered = filtered.filter((r) => r.status === selectedStatus)
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter((r) => {
        const fullName = `${r.user_profiles?.first_name || ""} ${r.user_profiles?.last_name || ""}`.toLowerCase()
        const employeeId = r.user_profiles?.employee_id?.toLowerCase() || ""
        const department = r.user_profiles?.departments?.name?.toLowerCase() || ""
        const assignedLocation = r.user_profiles?.assigned_location?.name?.toLowerCase() || ""
        const district = r.user_profiles?.assigned_location?.districts?.name?.toLowerCase() || ""

        return (
          fullName.includes(query) ||
          employeeId.includes(query) ||
          department.includes(query) ||
          assignedLocation.includes(query) ||
          district.includes(query)
        )
      })
    }

    return filtered
  }

  const filteredRecords = useMemo(() => applyClientFilters(records), [records, selectedDepartment, selectedLocation, selectedDistrict, selectedStatus, searchQuery])

  const columnFilteredRecords = useMemo(() => {
    let r = filteredRecords
    if (colFilter.employee.trim()) {
      const q = colFilter.employee.trim().toLowerCase()
      r = r.filter((rec) => {
        const name = displayUserLabel(rec).toLowerCase()
        const eid = (rec.user_profiles?.employee_id || '').toLowerCase()
        return name.includes(q) || eid.includes(q)
      })
    }
    if (colFilter.department.trim()) {
      const q = colFilter.department.trim().toLowerCase()
      r = r.filter((rec) => (rec.user_profiles?.departments?.name || '').toLowerCase().includes(q))
    }
    if (colFilter.checkInLocation.trim()) {
      const q = colFilter.checkInLocation.trim().toLowerCase()
      r = r.filter((rec) => getLocationLabel(rec, 'in').toLowerCase().includes(q))
    }
    if (colFilter.checkOutLocation.trim()) {
      const q = colFilter.checkOutLocation.trim().toLowerCase()
      r = r.filter((rec) => getLocationLabel(rec, 'out').toLowerCase().includes(q))
    }
    if (colFilter.status !== 'all') {
      r = r.filter((rec) => rec.status === colFilter.status)
    }
    if (colFilter.hoursMin !== '') {
      const min = parseFloat(colFilter.hoursMin)
      if (!isNaN(min)) r = r.filter((rec) => (rec.work_hours || 0) >= min)
    }
    if (colFilter.hoursMax !== '') {
      const max = parseFloat(colFilter.hoursMax)
      if (!isNaN(max)) r = r.filter((rec) => (rec.work_hours || 0) <= max)
    }
    return r
  }, [filteredRecords, colFilter])

  const presentCount = useMemo(() => records.filter((r) => r.status === "present" || r.check_in_time).length, [records])

  const setQuickDate = (preset: "today" | "week" | "month" | "quarter") => {
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]

    switch (preset) {
      case "today":
        setStartDate(todayStr)
        setEndDate(todayStr)
        break
      case "week":
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - today.getDay())
        setStartDate(weekStart.toISOString().split("T")[0])
        setEndDate(todayStr)
        break
      case "month":
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        setStartDate(monthStart.toISOString().split("T")[0])
        setEndDate(todayStr)
        break
      case "quarter":
        const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
        setStartDate(quarterStart.toISOString().split("T")[0])
        setEndDate(todayStr)
        break
    }
  }

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedRecords = useMemo(() => {
    const arr = [...columnFilteredRecords]
    arr.sort((a: any, b: any) => {
      const get = (r: any) => {
        switch (sortKey) {
          case 'check_in_time':
            return new Date(r.check_in_time).getTime() || 0
          case 'check_out_time':
            return r.check_out_time ? new Date(r.check_out_time).getTime() : 0
          case 'work_hours':
            return r.work_hours || 0
          case 'last_name':
            return (r.user_profiles?.last_name || '').toLowerCase()
          case 'department':
            return (r.user_profiles?.departments?.name || '').toLowerCase()
          case 'status':
            return (r.status || '').toLowerCase()
          default:
            return ''
        }
      }

      const va = get(a)
      const vb = get(b)

      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return 0
    })
    return arr
  }, [columnFilteredRecords, sortKey, sortDir])

  // Derived paged lists for Reasons tab (computed here to avoid inline IIFEs in JSX)
  const latenessList = reasonsRecords.filter((r) => r.lateness_reason)
  const latenessStart = (reasonsPage - 1) * reasonsPageSize
  const latenessPageItems = latenessList.slice(latenessStart, latenessStart + reasonsPageSize)

  const earlyList = reasonsRecords.filter((r) => r.early_checkout_reason)
  const earlyStart = (earlyPage - 1) * earlyPageSize
  const earlyPageItems = earlyList.slice(earlyStart, earlyStart + earlyPageSize)

  return (
    <div className={compactMode ? "space-y-2 text-sm" : "space-y-4"}>
      {/* Advanced Filters */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-pink-500" />
          <div className={compactMode ? "p-2" : "p-4 sm:p-5 md:p-6"}>
            {exportError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-2 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-red-700 text-sm font-medium">{exportError}</p>
              </div>
            )}
          </div>

        <div className={compactMode ? "p-2" : "p-4 sm:p-5 md:p-6"}>
          {/* Primary Filters */}
          <div className={compactMode ? "grid gap-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 mb-3 items-end" : "grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4 items-end"}>
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-blue-600" />
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`w-full border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-150 bg-gray-50 hover:bg-white ${compactMode ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}`}
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-blue-600" />
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`w-full border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-150 bg-gray-50 hover:bg-white ${compactMode ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}`}
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-green-600" />
                Location
              </label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className={`w-full border border-gray-200 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-150 bg-gray-50 hover:bg-white ${compactMode ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}`}>
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-600" />
                Department
              </label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className={`w-full border border-gray-200 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-150 bg-gray-50 hover:bg-white ${compactMode ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}`}>
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
            </div>
          </div>

          {/* Secondary Filters - simplified (search only) */}
          <div className="grid gap-4 mb-4">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Search className="h-4 w-4 text-pink-600" />
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, ID, department..."
                  className={`w-full pl-10 pr-4 ${compactMode ? 'py-1.5 text-xs' : 'py-2 text-sm'} border border-gray-200 rounded-md focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-150 bg-gray-50 hover:bg-white`}
                />
              </div>
            </div>
          </div>

          {!loading && records.length === 0 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileText className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Found</h3>
              <p className="text-gray-500">Try adjusting your filters or date range to see attendance records.</p>
            </div>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid gap-3 w-full" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {/* Total Records Card - Primary */}
          <div className="relative overflow-hidden rounded-xl p-2 text-white shadow-sm transition-all duration-200 transform hover:-translate-y-0.5 w-full bg-slate-800 border border-slate-700">
            <div className="absolute top-4 right-4">
              <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                <FileText className="w-3 h-3 mr-1" />
                Primary
              </Badge>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-white/20 rounded-md">
                <FileText className="h-5 w-5" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-white/80 text-sm font-medium">Total Records</p>
              <p className={compactMode ? "text-lg font-semibold" : "text-2xl font-bold"}>{summary.totalRecords.toLocaleString()}</p>
              <p className="text-white/60 text-xs">Attendance entries</p>
            </div>
          </div>

          {/* Present Count Card */}
          <div className="relative overflow-hidden rounded-xl p-2 text-white shadow-sm transition-all duration-200 transform hover:-translate-y-0.5 w-full bg-emerald-600 border border-emerald-700">
            <div className="absolute top-4 right-4">
              <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                <CheckCircle className="w-3 h-3 mr-1" />
                On Time
              </Badge>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <CheckCircle className="h-6 w-6" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-white/80 text-sm font-medium">Present</p>
              <p className={compactMode ? "text-lg font-semibold" : "text-2xl font-bold"}>{presentCount.toLocaleString()}</p>
              <p className="text-white/60 text-xs">On time arrivals</p>
            </div>
          </div>

          {/* Late Arrivals Card */}
          <div className="relative overflow-hidden rounded-xl p-2 text-white shadow-sm transition-all duration-200 transform hover:-translate-y-0.5 w-full bg-amber-600 border border-amber-700">
            <div className="absolute top-4 right-4">
              <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Attention
              </Badge>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <AlertTriangle className="h-6 w-6" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-white/80 text-sm font-medium">Late</p>
              <p className={compactMode ? "text-lg font-semibold" : "text-2xl font-bold"}>{summary.statusCounts.late || 0}</p>
              <p className="text-white/60 text-xs">Late arrivals</p>
            </div>
          </div>

          {/* Total Hours Card */}
          <div className="relative overflow-hidden rounded-xl p-2 text-white shadow-sm transition-all duration-200 transform hover:-translate-y-0.5 w-full bg-indigo-600 border border-indigo-700">
            <div className="absolute top-4 right-4">
              <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                <Clock className="w-3 h-3 mr-1" />
                Productivity
              </Badge>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <Clock className="h-6 w-6" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-white/80 text-sm font-medium">Total Hours</p>
              <p className={compactMode ? "text-lg font-semibold" : "text-2xl font-bold"}>{Math.round(summary.totalWorkHours).toLocaleString()}</p>
              <p className="text-white/60 text-xs">Work hours logged</p>
            </div>
          </div>

          {/* Departments Card */}
          <div className="relative overflow-hidden rounded-xl p-2 text-white shadow-sm transition-all duration-200 transform hover:-translate-y-0.5 w-full bg-violet-600 border border-violet-700">
            <div className="absolute top-4 right-4">
              <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                <Users className="w-3 h-3 mr-1" />
                Teams
              </Badge>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <Users className="h-6 w-6" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-white/80 text-sm font-medium">Departments</p>
              <p className={compactMode ? "text-lg font-semibold" : "text-2xl font-bold"}>{Object.keys(summary.departmentStats).length}</p>
              <p className="text-white/60 text-xs">Active departments</p>
            </div>
          </div>

          {/* Locations Card */}
          <div className="relative overflow-hidden rounded-xl p-2 text-white shadow-sm transition-all duration-200 transform hover:-translate-y-0.5 w-full bg-teal-600 border border-teal-700">
            <div className="absolute top-4 right-4">
              <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                <MapPin className="w-3 h-3 mr-1" />
                Locations
              </Badge>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <MapPin className="h-6 w-6" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-white/80 text-sm font-medium">Locations</p>
              <p className={compactMode ? "text-lg font-semibold" : "text-2xl font-bold"}>{locations.length}</p>
              <p className="text-white/60 text-xs">Active locations</p>
            </div>
          </div>

            {/* Quick Select (compact tab-style) */}
            <div className="min-w-[220px] self-start">
              <div className="flex items-center gap-3 border border-amber-100 bg-amber-50 rounded-md p-2 shadow-sm h-12">
                <div className="flex items-center gap-2 pl-2 pr-3 border-r border-amber-100">
                  <CalendarIcon className="h-5 w-5 text-amber-600" />
                  <span className="text-amber-800 text-sm font-medium">Quick Select</span>
                </div>

                <div className="flex gap-2 items-center">
                  <Button variant={compactMode ? "ghost" : "outline"} size="sm" onClick={() => setQuickDate('today')} className="text-amber-700 px-3 py-1 text-xs">Today</Button>
                  <Button variant={compactMode ? "ghost" : "outline"} size="sm" onClick={() => setQuickDate('week')} className="text-amber-700 px-3 py-1 text-xs">Week</Button>
                  <Button variant={compactMode ? "ghost" : "outline"} size="sm" onClick={() => setQuickDate('month')} className="text-amber-700 px-3 py-1 text-xs">Month</Button>
                </div>
              </div>
            </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-gray-100">
        <div className="flex gap-3 items-center">
          <Button
            onClick={fetchReport}
            disabled={loading}
            className={`bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white ${compactMode ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} rounded-md shadow-sm hover:shadow-md transition-all duration-200`}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-5 w-5" />
                Generate Report
              </>
            )}
          </Button>

          <div className="flex gap-2 items-center">
            <Button
              onClick={() => exportReport("excel")}
              variant="outline"
              disabled={exporting || records.length === 0 || loading}
              className={`border-green-200 text-green-700 hover:bg-green-50 ${compactMode ? 'px-2 py-1 text-xs' : 'px-3 py-2 rounded-md'} transition-all duration-150 text-sm`}
            >
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Excel
            </Button>
            <Button
              onClick={() => exportReport("csv")}
              variant="outline"
              disabled={exporting || records.length === 0 || loading}
              className={`border-blue-200 text-blue-700 hover:bg-blue-50 ${compactMode ? 'px-2 py-1 text-xs' : 'px-3 py-2 rounded-md'} transition-all duration-150 text-sm`}
            >
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              CSV
            </Button>
          </div>

          {/* Compact / Landscape toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCompactMode((s) => !s)}
            className={`h-8 ${compactMode ? 'bg-slate-800 text-white' : 'bg-white/5 text-gray-200'} rounded-md px-2 py-1 ml-2 text-sm`}
            title="Toggle compact / landscape view (mobile)"
          >
            {compactMode ? 'Compact / Landscape' : 'Normal View'}
          </Button>
        </div>

        {/* Quick Date Select */}
        <div className="flex gap-2"> 
          <span className="text-sm font-medium text-gray-600 self-center mr-2">Quick:</span>
          {[
            { label: "Today", value: "today" },
            { label: "Week", value: "week" },
            { label: "Month", value: "month" },
            { label: "Quarter", value: "quarter" }
          ].map((option) => (
            <Button
              key={option.value}
              variant="ghost"
              size="sm"
              onClick={() => setQuickDate(option.value as any)}
              className="text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-md transition-all duration-150 text-sm"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Column visibility controls removed per request */}

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-pink-500" />
        <div className="border-b border-gray-200">
          <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="details" className="w-full">
            <div className="px-4 pt-4">
              <TabsList className={`grid w-full grid-cols-4 bg-slate-100 p-1 rounded-xl ${compactMode ? 'h-10' : 'h-12'}`}>
                <TabsTrigger
                  value="details"
                  className="rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-slate-900 transition-all duration-200 flex items-center justify-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Details</span>
                </TabsTrigger>
                <TabsTrigger
                  value="overview"
                  className="rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-slate-900 transition-all duration-200 flex items-center justify-center gap-1.5"
                >
                  <BarChart3 className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Overview</span>
                </TabsTrigger>
                <TabsTrigger
                  value="departments"
                  className="rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-slate-900 transition-all duration-200 flex items-center justify-center gap-1.5"
                >
                  <Users className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="hidden sm:inline">Departments</span>
                  <span className="sm:hidden">Depts</span>
                </TabsTrigger>
                <TabsTrigger
                  value="reasons"
                  className="rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-slate-900 transition-all duration-200 flex items-center justify-center gap-1.5"
                >
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Reasons</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="px-4 py-4 space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 sm:p-4 md:p-6 border border-blue-100">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-blue-100 rounded-xl">
                      <BarChart3 className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Attendance by Department</h3>
                      <p className="text-gray-600">Distribution of attendance records</p>
                    </div>
                  </div>
                  <div className="h-48 md:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(summary?.departmentStats || {}).map(([dept, stats]: [string, any]) => ({
                            name: dept,
                            value: stats.count,
                            hours: stats.totalHours,
                          }))}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {Object.entries(summary?.departmentStats || {}).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name) => [
                            `${value} records`,
                            name
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 sm:p-4 md:p-6 border border-green-100">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-green-100 rounded-xl">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Attendance Status</h3>
                      <p className="text-gray-600">Breakdown of attendance statuses</p>
                    </div>
                  </div>
                  <div className="h-48 md:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={Object.entries(summary?.statusCounts || {}).map(([status, count]) => ({
                        status: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
                        count,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="status"
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                          }}
                        />
                        <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="trends" className="px-4 py-4 space-y-6">
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-3 sm:p-4 md:p-6 border border-purple-100">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-purple-100 rounded-xl">
                    <BarChart3 className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Attendance Trends</h3>
                    <p className="text-gray-600">Daily attendance patterns over time</p>
                  </div>
                </div>
                <div className="h-64 md:h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analyticsData.dailyTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="present"
                        stroke="#8b5cf6"
                        strokeWidth={3}
                        dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#8b5cf6', strokeWidth: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="late"
                        stroke="#f59e0b"
                        strokeWidth={3}
                        dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#f59e0b', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="departments" className="px-4 py-4 space-y-6">
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-6 sm:p-4 md:p-6 border border-indigo-100">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-indigo-100 rounded-xl">
                    <Users className="h-6 w-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Department Performance</h3>
                    <p className="text-gray-600">Comparative analysis across departments</p>
                  </div>
                </div>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={Object.entries(summary?.departmentStats || {}).map(([dept, stats]: [string, any]) => ({
                      department: dept,
                      attendance: stats.count,
                      hours: Math.round(stats.totalHours),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="department"
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Bar dataKey="attendance" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="details" className="px-4 py-4">
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden dark:bg-slate-900 dark:border-slate-700">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">Detailed Records</h3>
                      <p className="text-gray-600 dark:text-slate-300 mt-1">
                        Showing {records.length} of {totalRecords.toLocaleString()} records
                      </p>
                    </div>
                      <Badge variant="secondary" className="px-4 py-2 dark:bg-slate-800 dark:text-slate-100">
                      {records.length} Records (page)
                    </Badge>
                  </div>
                </div>

                <div className="hidden sm:block overflow-x-auto">
                  <Table className="min-w-full text-sm text-gray-800 dark:text-slate-200">
                    <TableHeader>
                      {/* Sort row */}
                      <TableRow className="bg-gray-50 dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700">
                        {([
                          { key: 'check_in_time', label: 'Date' },
                          { key: 'last_name', label: 'Employee' },
                          { key: 'department', label: 'Department' },
                          { key: 'check_in_time2', label: 'Check In' },
                          { key: null, label: 'Check In Location' },
                          { key: 'check_out_time', label: 'Check Out', hidden: true },
                          { key: null, label: 'Check Out Location', hidden: true },
                          { key: 'work_hours', label: 'Hours' },
                          { key: 'status', label: 'Status' },
                          { key: null, label: 'Comment', hidden: true },
                          { key: null, label: 'Reason', hidden: true },
                        ] as Array<{ key: string | null; label: string; hidden?: boolean }>).map(({ key, label, hidden }) => (
                          <TableHead
                            key={label}
                            className={`font-semibold text-gray-700 dark:text-slate-200 py-2 text-sm select-none whitespace-nowrap ${
                              hidden ? 'hidden sm:table-cell' : ''
                            } ${key ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700' : ''}`}
                            onClick={() => key && toggleSort(key === 'check_in_time2' ? 'check_in_time' : key)}
                          >
                            <span className="flex items-center gap-1">
                              {label}
                              {key && (() => {
                                const sk = key === 'check_in_time2' ? 'check_in_time' : key
                                if (sortKey !== sk) return <ArrowUpDown className="h-3 w-3 text-gray-400" />
                                return sortDir === 'asc'
                                  ? <ArrowUp className="h-3 w-3 text-blue-500" />
                                  : <ArrowDown className="h-3 w-3 text-blue-500" />
                              })()}
                            </span>
                          </TableHead>
                        ))}
                      </TableRow>
                      {/* Inline filter row */}
                      <TableRow className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                        {/* Date — no inline filter (use date pickers above) */}
                        <TableHead className="py-1 px-2" />
                        {/* Employee */}
                        <TableHead className="py-1 px-2">
                          <input
                            value={colFilter.employee}
                            onChange={(e) => setCol('employee', e.target.value)}
                            placeholder="Filter name/ID"
                            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                          />
                        </TableHead>
                        {/* Department */}
                        <TableHead className="py-1 px-2">
                          <input
                            value={colFilter.department}
                            onChange={(e) => setCol('department', e.target.value)}
                            placeholder="Filter dept"
                            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                          />
                        </TableHead>
                        {/* Check In — no inline filter */}
                        <TableHead className="py-1 px-2" />
                        {/* Check In Location */}
                        <TableHead className="py-1 px-2">
                          <input
                            value={colFilter.checkInLocation}
                            onChange={(e) => setCol('checkInLocation', e.target.value)}
                            placeholder="Filter location"
                            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                          />
                        </TableHead>
                        {/* Check Out — no inline filter */}
                        <TableHead className="hidden sm:table-cell py-1 px-2" />
                        {/* Check Out Location */}
                        <TableHead className="hidden sm:table-cell py-1 px-2">
                          <input
                            value={colFilter.checkOutLocation}
                            onChange={(e) => setCol('checkOutLocation', e.target.value)}
                            placeholder="Filter location"
                            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                          />
                        </TableHead>
                        {/* Hours min/max */}
                        <TableHead className="py-1 px-2">
                          <div className="flex gap-1">
                            <input
                              value={colFilter.hoursMin}
                              onChange={(e) => setCol('hoursMin', e.target.value)}
                              placeholder="≥"
                              type="number"
                              min="0"
                              className="w-10 text-xs border border-gray-200 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                            />
                            <input
                              value={colFilter.hoursMax}
                              onChange={(e) => setCol('hoursMax', e.target.value)}
                              placeholder="≤"
                              type="number"
                              min="0"
                              className="w-10 text-xs border border-gray-200 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                            />
                          </div>
                        </TableHead>
                        {/* Status */}
                        <TableHead className="py-1 px-2">
                          <select
                            value={colFilter.status}
                            onChange={(e) => setCol('status', e.target.value)}
                            className="w-full text-xs border border-gray-200 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                          >
                            <option value="all">All</option>
                            <option value="present">Present</option>
                            <option value="late">Late</option>
                            <option value="absent">Absent</option>
                            <option value="on_leave">On Leave</option>
                          </select>
                        </TableHead>
                        {/* Comment + Reason — no inline filters */}
                        <TableHead className="hidden sm:table-cell py-1 px-2" />
                        <TableHead className="hidden sm:table-cell py-1 px-2" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedRecords.map((record) => (
                        <TableRow key={record.id} className="bg-white dark:bg-slate-900 even:bg-gray-50 dark:even:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                          <TableCell className={compactMode ? "py-1 text-gray-800 dark:text-slate-200 text-xs" : "py-2 text-gray-800 dark:text-slate-200 text-sm"}>{new Date(record.check_in_time).toLocaleDateString()}</TableCell>
                          <TableCell className="py-2 text-gray-800 dark:text-slate-200 text-sm">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                                {userInitials(record.user_profiles)}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-slate-100">{displayUserLabel(record)}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-300">{record.user_profiles?.employee_id || 'N/A'}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className={compactMode ? "py-1" : "py-2"}><Badge variant="outline" className={compactMode ? "font-medium text-gray-700 dark:text-slate-200 text-xs" : "font-medium text-gray-700 dark:text-slate-200 text-sm"}>{record.user_profiles?.departments?.name || 'N/A'}</Badge></TableCell>
                          <TableCell className={compactMode ? "py-1 text-gray-800 dark:text-slate-200 text-xs" : "py-2 text-gray-800 dark:text-slate-200 text-sm"}>{new Date(record.check_in_time).toLocaleTimeString()}</TableCell>
                          <TableCell className="py-2 text-gray-800 dark:text-slate-200 text-sm"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-500 dark:text-slate-400" /><span className="text-sm text-gray-700 dark:text-slate-300 max-w-xs truncate block" title={getLocationLabel(record, 'in')}>{getLocationLabel(record, 'in')}</span></div></TableCell>
                          <TableCell className={compactMode ? "hidden sm:table-cell py-1 text-gray-800 dark:text-slate-200 text-xs" : "hidden sm:table-cell py-2 text-gray-800 dark:text-slate-200 text-sm"}>{record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : <span className="text-gray-400 dark:text-slate-400">-</span>}</TableCell>
                          <TableCell className="hidden sm:table-cell py-2 text-gray-800 dark:text-slate-200 text-sm"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-500 dark:text-slate-400" /><span className="text-sm text-gray-700 dark:text-slate-300 max-w-xs truncate block" title={getLocationLabel(record, 'out')}>{getLocationLabel(record, 'out')}</span></div></TableCell>
                          <TableCell className={compactMode ? "py-1 text-gray-800 dark:text-slate-200 text-xs" : "py-2 text-gray-800 dark:text-slate-200 text-sm"}><span className="font-medium">{record.work_hours ? `${record.work_hours.toFixed(1)}h` : '-'}</span></TableCell>
                          <TableCell className="py-2"><Badge
                            variant={
                              record.status === 'present' ? 'default' :
                              record.status === 'late' ? 'secondary' :
                              record.status === 'absent' ? 'destructive' : 'outline'
                            }
                            className="font-medium text-sm"
                          >{record.status.charAt(0).toUpperCase() + record.status.slice(1).replace('_', ' ')}</Badge></TableCell>
                          <TableCell className="hidden sm:table-cell py-2">
                            <span className="text-sm text-gray-700 dark:text-slate-300">
                              {record.notes ? (
                                <span className="max-w-xs truncate block" title={record.notes}>
                                  {record.notes}
                                </span>
                              ) : (
                                <span className="text-gray-400 dark:text-slate-400">-</span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell py-2">
                            <span className="text-sm text-gray-700 dark:text-slate-300">
                              {record.lateness_reason || record.early_checkout_reason ? (
                                <div className="space-y-1">
                                  {record.lateness_reason && (
                                    <div className="text-orange-600">
                                      <span className="font-medium">Late:</span>
                                      <span className="max-w-xs truncate block ml-1" title={record.lateness_reason}>
                                        {record.lateness_reason}
                                      </span>
                                    </div>
                                  )}
                                  {record.early_checkout_reason && (
                                    <div className="text-blue-600">
                                      <span className="font-medium">Early:</span>
                                      <span className="max-w-xs truncate block ml-1" title={record.early_checkout_reason}>
                                        {record.early_checkout_reason}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400 dark:text-slate-400">-</span>
                              )}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile condensed list */}
                <div className={`${compactMode ? 'flex sm:hidden space-x-3 overflow-x-auto px-3 py-3' : 'block sm:hidden space-y-3 px-4 py-4'}`}>
                  {sortedRecords.map((record) => (
                    <div key={record.id} className="p-2 bg-white rounded-md shadow-sm border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{displayUserLabel(record)} <span className="text-xs text-gray-500">({record.user_profiles?.employee_id || record.user_id?.slice(0,8) || 'N/A'})</span></p>
                          <p className="text-xs text-gray-500">{new Date(record.check_in_time).toLocaleDateString()} • {new Date(record.check_in_time).toLocaleTimeString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{record.work_hours ? `${record.work_hours.toFixed(1)}h` : '-'}</p>
                          <div className="mt-1">
                            <Badge variant="outline" className="text-xs">{record.status.charAt(0).toUpperCase() + record.status.slice(1)}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-600 flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span className="max-w-xs truncate block" title={getLocationLabel(record, 'in')}>{getLocationLabel(record, 'in')}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                  <div className="px-3 py-2">
                    <p className="text-xs text-gray-500 italic">Note: when a staff member checked in using an off‑premises request, the Google location name (if available) is shown.</p>
                  </div>
                <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPage(1)} disabled={page === 1}>First</Button>
                    <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
                    <span className="text-sm text-gray-600">Page {page} of {Math.max(1, Math.ceil(totalRecords / pageSize))}</span>
                    <Button variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= Math.max(1, Math.ceil(totalRecords / pageSize))}>Next</Button>
                    <Button variant="ghost" size="sm" onClick={() => setPage(Math.max(1, Math.ceil(totalRecords / pageSize)))} disabled={page >= Math.max(1, Math.ceil(totalRecords / pageSize))}>Last</Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Page size:</span>
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v, 10)); setPage(1); }}>
                      <SelectTrigger className="w-24 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="reasons" className="px-8 py-8">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">Attendance Reasons</h3>
                    <p className="text-gray-600 mt-1">Review lateness and early checkout explanations</p>
                  </div>
                  <Badge variant="secondary" className="px-4 py-2">
                      {reasonsRecords.filter(r => r.lateness_reason || r.early_checkout_reason).length} Records with Reasons
                  </Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-orange-500" />
                        Lateness Reasons
                        <Badge className="ml-auto bg-orange-100 text-orange-700 border-orange-200">{latenessList.length}</Badge>
                      </CardTitle>
                      <CardDescription>Staff explanations for arriving after 9:00 AM</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {latenessPageItems.map((record) => {
                          const staffName = displayUserLabel(record)
                          const empId = record.user_profiles?.employee_id
                          const dept = record.user_profiles?.departments?.name
                          const initials = staffName
                            .split(' ')
                            .filter((w: string) => w.length > 0 && !w.startsWith('(') && w !== 'Staff' && w !== 'at')
                            .slice(0, 2)
                            .map((w: string) => w[0].toUpperCase())
                            .join('') || '?'
                          return (
                            <div key={record.id} className="rounded-lg border border-orange-200 bg-orange-50 overflow-hidden">
                              {/* Staff identity header */}
                              <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-orange-100">
                                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm">
                                  {initials}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-base font-bold text-gray-900 leading-tight truncate">{staffName}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {empId ? <span className="font-medium text-gray-700">ID: {empId}</span> : null}
                                    {empId && dept ? <span className="mx-1 text-gray-300">·</span> : null}
                                    {dept ? <span>{dept}</span> : null}
                                    {!empId && !dept ? <span className="italic text-gray-400">No profile on file</span> : null}
                                  </p>
                                </div>
                                {dept && (
                                  <Badge variant="secondary" className="flex-shrink-0 text-xs bg-orange-100 text-orange-800 border-orange-200">
                                    {dept}
                                  </Badge>
                                )}
                              </div>
                              {/* Check-in time + location */}
                              <div className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 bg-orange-50">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-orange-400" />
                                  {new Date(record.check_in_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                  {' — '}
                                  <span className="font-semibold text-orange-700">{new Date(record.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </span>
                                <span className="flex items-center gap-1 max-w-[180px] truncate" title={getLocationLabel(record, 'in')}>
                                  <MapPin className="h-3 w-3 text-orange-400 flex-shrink-0" />
                                  {getLocationLabel(record, 'in')}
                                </span>
                              </div>
                              {/* Reason */}
                              <div className="px-4 py-3">
                                <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-1">Reason for Lateness</p>
                                <p className="text-sm text-gray-800 leading-relaxed">{record.lateness_reason}</p>
                                {record.lateness_proved_by && (
                                  <div className="mt-2 pt-2 border-t border-orange-200 flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-green-600">✓ Verified by:</span>
                                    <span className="text-xs text-green-700 font-medium">{record.lateness_proved_by}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        {latenessList.length === 0 && (
                          <div className="text-center py-8">
                            <Clock className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-400 text-sm">No lateness reasons recorded</p>
                          </div>
                        )}

                        {/* Lateness pagination controls */}
                        {reasonsRecords.filter(r => r.lateness_reason).length > reasonsPageSize && (
                          <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setReasonsPage(1)} disabled={reasonsPage === 1}>First</Button>
                              <Button variant="ghost" size="sm" onClick={() => setReasonsPage((p) => Math.max(1, p - 1))} disabled={reasonsPage === 1}>Prev</Button>
                              <span className="text-sm text-gray-600">Page {reasonsPage} of {Math.max(1, Math.ceil(reasonsRecords.filter(r => r.lateness_reason).length / reasonsPageSize))}</span>
                              <Button variant="ghost" size="sm" onClick={() => setReasonsPage((p) => p + 1)} disabled={reasonsPage >= Math.max(1, Math.ceil(reasonsRecords.filter(r => r.lateness_reason).length / reasonsPageSize))}>Next</Button>
                              <Button variant="ghost" size="sm" onClick={() => setReasonsPage(Math.max(1, Math.ceil(reasonsRecords.filter(r => r.lateness_reason).length / reasonsPageSize)))} disabled={reasonsPage >= Math.max(1, Math.ceil(reasonsRecords.filter(r => r.lateness_reason).length / reasonsPageSize))}>Last</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-blue-500" />
                        Early Checkout Reasons
                        <Badge className="ml-auto bg-blue-100 text-blue-700 border-blue-200">{earlyList.length}</Badge>
                      </CardTitle>
                      <CardDescription>Staff explanations for leaving before standard hours</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {earlyPageItems.map((record) => {
                          const staffName = displayUserLabel(record)
                          const empId = record.user_profiles?.employee_id
                          const dept = record.user_profiles?.departments?.name
                          const initials = staffName
                            .split(' ')
                            .filter((w: string) => w.length > 0 && !w.startsWith('(') && w !== 'Staff' && w !== 'at')
                            .slice(0, 2)
                            .map((w: string) => w[0].toUpperCase())
                            .join('') || '?'
                          return (
                            <div key={record.id} className="rounded-lg border border-blue-200 bg-blue-50 overflow-hidden">
                              {/* Staff identity header */}
                              <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-blue-100">
                                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-sm">
                                  {initials}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-base font-bold text-gray-900 leading-tight truncate">{staffName}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {empId ? <span className="font-medium text-gray-700">ID: {empId}</span> : null}
                                    {empId && dept ? <span className="mx-1 text-gray-300">·</span> : null}
                                    {dept ? <span>{dept}</span> : null}
                                    {!empId && !dept ? <span className="italic text-gray-400">No profile on file</span> : null}
                                  </p>
                                </div>
                                {dept && (
                                  <Badge variant="secondary" className="flex-shrink-0 text-xs bg-blue-100 text-blue-800 border-blue-200">
                                    {dept}
                                  </Badge>
                                )}
                              </div>
                              {/* Check-out time + location */}
                              <div className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 bg-blue-50">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-blue-400" />
                                  {new Date(record.check_out_time!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                  {' — '}
                                  <span className="font-semibold text-blue-700">{new Date(record.check_out_time!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </span>
                                <span className="flex items-center gap-1 max-w-[180px] truncate" title={getLocationLabel(record, 'out')}>
                                  <MapPin className="h-3 w-3 text-blue-400 flex-shrink-0" />
                                  {getLocationLabel(record, 'out')}
                                </span>
                              </div>
                              {/* Reason */}
                              <div className="px-4 py-3">
                                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">Reason for Early Checkout</p>
                                <p className="text-sm text-gray-800 leading-relaxed">{record.early_checkout_reason}</p>
                                {record.early_checkout_proved_by && (
                                  <div className="mt-2 pt-2 border-t border-blue-200 flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-green-600">✓ Verified by:</span>
                                    <span className="text-xs text-green-700 font-medium">{record.early_checkout_proved_by}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        {earlyList.length === 0 && (
                          <div className="text-center py-8">
                            <AlertCircle className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-400 text-sm">No early checkout reasons recorded</p>
                          </div>
                        )}

                        {/* Early checkout pagination controls */}
                        {reasonsRecords.filter(r => r.early_checkout_reason).length > earlyPageSize && (
                          <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setEarlyPage(1)} disabled={earlyPage === 1}>First</Button>
                              <Button variant="ghost" size="sm" onClick={() => setEarlyPage((p) => Math.max(1, p - 1))} disabled={earlyPage === 1}>Prev</Button>
                              <span className="text-sm text-gray-600">Page {earlyPage} of {Math.max(1, Math.ceil(reasonsRecords.filter(r => r.early_checkout_reason).length / earlyPageSize))}</span>
                              <Button variant="ghost" size="sm" onClick={() => setEarlyPage((p) => p + 1)} disabled={earlyPage >= Math.max(1, Math.ceil(reasonsRecords.filter(r => r.early_checkout_reason).length / earlyPageSize))}>Next</Button>
                              <Button variant="ghost" size="sm" onClick={() => setEarlyPage(Math.max(1, Math.ceil(reasonsRecords.filter(r => r.early_checkout_reason).length / earlyPageSize)))} disabled={earlyPage >= Math.max(1, Math.ceil(reasonsRecords.filter(r => r.early_checkout_reason).length / earlyPageSize))}>Last</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Reason Summary by Location</CardTitle>
                    <CardDescription>Overview of reasons provided across different locations</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                          {Object.entries(
                            reasonsRecords
                              .filter((r) => r.lateness_reason || r.early_checkout_reason)
                              .reduce((acc, record) => {
                                const location = getLocationLabel(record, 'in') || 'Unknown'
                                if (!acc[location]) {
                                  acc[location] = { lateness: 0, earlyCheckout: 0 }
                                }
                                if (record.lateness_reason) acc[location].lateness++
                                if (record.early_checkout_reason) acc[location].earlyCheckout++
                                return acc
                              }, {} as Record<string, { lateness: number; earlyCheckout: number }>)
                          ).map(([location, counts]) => (
                        <div key={location} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <MapPin className="h-5 w-5 text-gray-400" />
                            <span className="font-medium">{location}</span>
                          </div>
                          <div className="flex gap-4">
                            <div className="text-center">
                              <p className="text-sm text-orange-600 font-medium">{counts.lateness}</p>
                              <p className="text-xs text-gray-500">Lateness</p>
                            </div>
                            <div className="text-center">
                              <p className="text-sm text-blue-600 font-medium">{counts.earlyCheckout}</p>
                              <p className="text-xs text-gray-500">Early Checkout</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

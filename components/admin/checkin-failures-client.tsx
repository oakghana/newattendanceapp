"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { AlertTriangle, CheckCircle2, Download, Loader2, LogIn, LogOut, RefreshCw, Search, Trash2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type FailureRecord = {
  id: string
  created_at: string
  user_id: string | null
  employee_id: string
  full_name: string
  role: string
  department_id: string | null
  department_name: string
  attempt_type:
    | "manual_checkin"
    | "offpremises_checkin"
    | "manual_checkout"
    | "offpremises_checkout"
    | "qr_checkout"
    | "auto_checkout"
    | string
  failure_reason: string
  failure_message: string
  nearest_location_name: string
  nearest_location_distance_m: number | null
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  device_type: string
  ip_address: string | null
}

type SummaryUser = {
  user_id: string | null
  employee_id: string
  full_name: string
  department_name: string
  role: string
  attempts: number
  last_attempt_at: string
}

type SummaryReason = {
  reason: string
  attempts: number
}

export function CheckinFailuresClient() {
  const [records, setRecords] = useState<FailureRecord[]>([])
  const [summaryUsers, setSummaryUsers] = useState<SummaryUser[]>([])
  const [summaryReasons, setSummaryReasons] = useState<SummaryReason[]>([])
  const [totalAttempts, setTotalAttempts] = useState(0)
  const [uniqueUsers, setUniqueUsers] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0])
  const [typeFilter, setTypeFilter] = useState<
    "all" | "manual" | "offpremises" | "checkin" | "checkout" | "qr_checkout" | "auto_checkout"
  >("all")
  const [reasonFilter, setReasonFilter] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [totalRows, setTotalRows] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const formatAttemptType = (attemptType: string) => {
    switch (attemptType) {
      case "manual_checkin":
        return "Manual Check-In"
      case "offpremises_checkin":
        return "Off-Premises Check-In"
      case "manual_checkout":
        return "Manual Check-Out"
      case "offpremises_checkout":
        return "Off-Premises Check-Out"
      case "qr_checkout":
        return "QR Check-Out"
      case "auto_checkout":
        return "Auto Check-Out"
      case "auto_checkout_recovery":
        return "Auto Recovery Check-Out"
      default:
        return attemptType.replace(/_/g, " ")
    }
  }

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        start_date: startDate,
        end_date: endDate,
        type: typeFilter,
      })

      if (reasonFilter.trim()) {
        params.set("reason", reasonFilter.trim())
      }

      const response = await fetch(`/api/admin/checkin-failures?${params}`, {
        cache: "no-store",
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to load failed attendance attempts")
      }

      const payload = result.data
      setRecords(payload.records || [])
      setSummaryUsers(payload.summary?.byUser || [])
      setSummaryReasons(payload.summary?.byReason || [])
      setTotalAttempts(payload.summary?.totalAttempts || 0)
      setUniqueUsers(payload.summary?.uniqueUsers || 0)
      setTotalRows(result.pagination?.total || 0)
      setTotalPages(result.pagination?.totalPages || 1)
    } catch (err) {
      console.error("[v0] Failed loading attendance failures:", err)
      setError(err instanceof Error ? err.message : "Failed to load failed attendance attempts")
    } finally {
      setLoading(false)
    }
  }, [endDate, limit, page, reasonFilter, startDate, typeFilter])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    setPage(1)
  }, [startDate, endDate, typeFilter, reasonFilter, limit])

  const topReason = useMemo(() => summaryReasons[0]?.reason || "none", [summaryReasons])

  const exportExcel = useCallback(async () => {
    if (records.length === 0) {
      setError("No records available to export")
      return
    }

    try {
      setError(null)
      const XLSX = await import("xlsx")

      const attemptsSheet = records.map((row) => ({
        "Attempt Date": format(new Date(row.created_at), "yyyy-MM-dd HH:mm:ss"),
        "Employee ID": row.employee_id,
        Name: row.full_name,
        Department: row.department_name,
        Role: row.role,
        "Attempt Type": row.attempt_type,
        "Failure Reason": row.failure_reason,
        "Failure Message": row.failure_message || "-",
        "Nearest Location": row.nearest_location_name,
        "Distance (m)": row.nearest_location_distance_m ?? "-",
        Latitude: row.latitude ?? "-",
        Longitude: row.longitude ?? "-",
        "GPS Accuracy": row.accuracy ?? "-",
        "Device Type": row.device_type,
        "IP Address": row.ip_address || "-",
      }))

      const usersSheet = summaryUsers.map((row) => ({
        "Employee ID": row.employee_id,
        Name: row.full_name,
        Department: row.department_name,
        Role: row.role,
        "Failed Attempts": row.attempts,
        "Last Attempt": format(new Date(row.last_attempt_at), "yyyy-MM-dd HH:mm:ss"),
      }))

      const reasonsSheet = summaryReasons.map((row) => ({
        Reason: row.reason,
        Attempts: row.attempts,
      }))

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attemptsSheet), "Failed Attempts")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usersSheet), "By User")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reasonsSheet), "By Reason")

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
      const blob = new Blob([out], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `attendance-failures-${startDate}-to-${endDate}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[v0] Failed exporting attendance failures:", err)
      setError("Failed to export Excel")
    }
  }, [endDate, records, startDate, summaryReasons, summaryUsers])

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Failed Attendance Attempts</h1>
          <p className="text-sm text-muted-foreground">
            Track failed check-ins and check-outs, including location, department, reason, and retry frequency.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void fetchData()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={exportExcel} disabled={loading || records.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          import { AlertTriangle, Download, Loader2, LogIn, LogOut, RefreshCw, Search, Trash2 } from "lucide-react"
          import {
            Dialog,
            DialogContent,
            DialogDescription,
            DialogFooter,
            DialogHeader,
            DialogTitle,
          } from "@/components/ui/dialog"
      </div>

      {error && (
            <Button onClick={exportExcel} disabled={loading || records.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button
              variant="destructive"
              onClick={() => { setDeleteMode("all"); setDeleteConfirmOpen(true) }}
              disabled={loading || totalAttempts === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Records
            </Button>
          </div>
        </div>

        {successMsg && (
          <Alert className="border-emerald-300 bg-emerald-50 text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              {successMsg}
              <button onClick={() => setSuccessMsg(null)} className="ml-2 text-xs underline">Dismiss</button>
            </AlertDescription>
          </Alert>
        )}

        {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Failed Attempts</CardDescription>
            <CardTitle className="text-2xl">{totalAttempts}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique Affected Users</CardDescription>
            <CardTitle className="text-2xl">{uniqueUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Most Common Reason</CardDescription>
            <CardTitle className="text-xl capitalize">{topReason.replace(/_/g, " ")}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Attempt Type</Label>
              <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="checkin">All Check-In Failures</SelectItem>
                  <SelectItem value="checkout">All Check-Out Failures</SelectItem>
                  <SelectItem value="manual">Manual (Check-In/Out)</SelectItem>
                  <SelectItem value="offpremises">Off-Premises (Check-In/Out)</SelectItem>
                  <SelectItem value="qr_checkout">QR Check-Out</SelectItem>
                  <SelectItem value="auto_checkout">Auto Check-Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={reasonFilter}
                  onChange={(e) => setReasonFilter(e.target.value)}
                  placeholder="e.g. out_of_range"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users With Most Failures</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Last Attempt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Last Attempt</TableHead>
                  <TableHead>Admin Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {loading ? "Loading..." : "No failed attempts in selected period."}
                  </TableCell>
                </TableRow>
              ) : (
                summaryUsers.map((row) => (
                  <TableRow key={`${row.user_id || row.employee_id}-${row.last_attempt_at}`}>
                    <TableCell>{row.full_name}</TableCell>
                    <TableCell>{row.employee_id}</TableCell>
                    <TableCell>{row.department_name}</TableCell>
                    <TableCell>{row.role}</TableCell>
                    <TableCell className="text-right font-semibold">{row.attempts}</TableCell>
                    <TableCell>{format(new Date(row.last_attempt_at), "PPpp")}</TableCell>
                  </TableRow>
                summaryUsers.map((row) => (
                    <TableRow key={`${row.user_id || row.employee_id}-${row.last_attempt_at}`}>
                      <TableCell>{row.full_name}</TableCell>
                      <TableCell>{row.employee_id}</TableCell>
                      <TableCell>{row.department_name}</TableCell>
                      <TableCell>{row.role}</TableCell>
                      <TableCell className="text-right font-semibold">{row.attempts}</TableCell>
                      <TableCell>{format(new Date(row.last_attempt_at), "PPpp")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs"
                            disabled={!row.user_id}
                            onClick={() => openForceDialog(row, "checkin")}
                          >
                            <LogIn className="h-3 w-3" /> Check In
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 border-rose-300 text-rose-700 hover:bg-rose-50 text-xs"
                            disabled={!row.user_id}
                            onClick={() => openForceDialog(row, "checkout")}
                          >
                            <LogOut className="h-3 w-3" /> Check Out
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Failure Attempt Details</CardTitle>
          <CardDescription>Includes location, reason, and exact error message per attempt.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="text-sm text-muted-foreground">
              Showing {records.length} of {totalRows} records
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Rows</Label>
              <Select
                value={String(limit)}
                onValueChange={(v) => {
                  setLimit(Number(v))
                }}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Nearest Location</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>Coords</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Nearest Location</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Coords</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No failed attempts found for current filters.
                  </TableCell>
                </TableRow>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      No failed attempts found for current filters.
                    </TableCell>
                  </TableRow>
              ) : (
                records.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{format(new Date(row.created_at), "PPpp")}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.full_name}</div>
                      <div className="text-xs text-muted-foreground">{row.employee_id}</div>
                    </TableCell>
                    <TableCell>{row.department_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {formatAttemptType(row.attempt_type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{row.failure_reason.replace(/_/g, " ")}</TableCell>
                    <TableCell>{row.nearest_location_name}</TableCell>
                    <TableCell>{row.nearest_location_distance_m != null ? `${Math.round(row.nearest_location_distance_m)}m` : "-"}</TableCell>
                    <TableCell>
                      {row.latitude != null && row.longitude != null
                        ? `${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}`
                        : "-"}
                    </TableCell>
                    <TableCell className="max-w-[360px] truncate" title={row.failure_message || undefined}>
                      {row.failure_message || "-"}
                    </TableCell>
                  </TableRow>
                      <TableCell className="max-w-[360px] truncate" title={row.failure_message || undefined}>
                        {row.failure_message || "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                          title="Delete this record"
                          onClick={() => {
                            setSelectedIds(new Set([row.id]))
                            setDeleteMode("selected")
                            setDeleteConfirmOpen(true)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
            <div className="text-sm text-muted-foreground">
              Page {page} of {Math.max(1, totalPages)}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
          </CardContent>
        </Card>

        {/* ── Delete Confirm Dialog ────────────────────────────────────────── */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-700">
                <Trash2 className="h-5 w-5" /> Confirm Delete
              </DialogTitle>
              <DialogDescription>
                {deleteMode === "all"
                  ? `This will permanently delete ALL failure records in the current date range (${startDate} → ${endDate}). This cannot be undone.`
                  : `This will permanently delete ${selectedIds.size} selected record(s). This cannot be undone.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleDeleteRecords()} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                {deleteMode === "all" ? "Delete All" : `Delete ${selectedIds.size} Record(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Force Attendance Dialog ──────────────────────────────────────── */}
        <Dialog open={forceDialogOpen} onOpenChange={setForceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className={`flex items-center gap-2 ${forceAction === "checkin" ? "text-emerald-700" : "text-rose-700"}`}>
                {forceAction === "checkin" ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
                Admin Force {forceAction === "checkin" ? "Check-In" : "Check-Out"}
              </DialogTitle>
              <DialogDescription>
                {forceTarget
                  ? `You are about to force ${forceAction === "checkin" ? "check in" : "check out"} ${forceTarget.full_name} (${forceTarget.employee_id}) right now using the current server time.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <span className="font-medium">{forceTarget?.full_name}</span>
                <span className="mx-2 text-slate-400">·</span>
                <span className="text-slate-500">{forceTarget?.department_name}</span>
                <span className="mx-2 text-slate-400">·</span>
                <span className="text-slate-500 capitalize">{forceTarget?.role}</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optional Note</Label>
                <Input
                  placeholder="Reason or note (optional)"
                  value={forceNote}
                  onChange={(e) => setForceNote(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setForceDialogOpen(false)} disabled={forceBusy}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleForceAttendance()}
                disabled={forceBusy || !forceTarget?.user_id}
                className={forceAction === "checkin" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"}
              >
                {forceBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : forceAction === "checkin" ? <LogIn className="h-4 w-4 mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
                Confirm {forceAction === "checkin" ? "Check-In" : "Check-Out"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

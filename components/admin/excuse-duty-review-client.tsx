"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  FileText,
  Calendar,
  Eye,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  Building2,
} from "lucide-react"
import { isRegionalHrRole, isRegionalManagerRole, normalizeAppRole } from "@/lib/role-capabilities"

interface Department {
  id: string
  name: string
  code: string
}

interface ExcuseDocument {
  id: string
  document_name: string
  document_type: string
  file_url?: string
  excuse_reason?: string
  excuse_date: string
  status: "pending" | "approved" | "rejected"
  reviewer?: {
    first_name: string
    last_name: string
  }
  reviewed_at?: string
  review_notes?: string
  created_at: string
  user_profiles: {
    first_name: string
    last_name: string
    employee_id: string
    department_id: string
    departments: {
      name: string
      code: string
    }
  }
}

interface ExcuseDutyReviewClientProps {
  userRole: string
  userDepartment?: string
}

export function ExcuseDutyReviewClient({ userRole, userDepartment }: ExcuseDutyReviewClientProps) {
  const normalizedRole = normalizeAppRole(userRole)
  const isRegionalScoped = isRegionalManagerRole(normalizedRole) || isRegionalHrRole(normalizedRole)
  const [excuseDocuments, setExcuseDocuments] = useState<ExcuseDocument[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<ExcuseDocument | null>(null)
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewStatus, setReviewStatus] = useState<"approved" | "rejected">("approved")
  const [reviewNotes, setReviewNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  // Default to pending to speed initial load; department heads see their department by default
  const [statusFilter, setStatusFilter] = useState("pending")
  const [departmentFilter, setDepartmentFilter] = useState<string>(() => {
    if (userRole !== "admin" && userDepartment) return userDepartment
    return "all"
  })
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState<string | null>(null)
  const [dateTo, setDateTo] = useState<string | null>(null)
  const [page, setPage] = useState<number>(1)
  const [perPage, setPerPage] = useState<number>(20)
  const [hasMore, setHasMore] = useState<boolean>(false)

  useEffect(() => {
    // When filters change, reset to first page
    setPage(1)
  }, [statusFilter, departmentFilter, docTypeFilter, dateFrom, dateTo, userRole, userDepartment])

  useEffect(() => {
    fetchExcuseDocuments()
    if (userRole === "admin") {
      fetchDepartments()
    }
  }, [statusFilter, departmentFilter, docTypeFilter, dateFrom, dateTo, page, perPage, userRole, userDepartment])

  const fetchDepartments = async () => {
    try {
      const response = await fetch("/api/admin/departments")
      if (response.ok) {
        const data = await response.json()
        setDepartments(data.departments || [])
      }
    } catch (error) {
      console.error("Failed to fetch departments:", error)
    }
  }

  const fetchExcuseDocuments = async () => {
    try {
      setLoading(true)
      setError("")
      const params = new URLSearchParams()
      if (statusFilter !== "all") {
        params.append("status", statusFilter)
      }
      if (departmentFilter !== "all" && userRole === "admin") {
        params.append("department", departmentFilter)
      }
      if (docTypeFilter !== "all") {
        params.append("document_type", docTypeFilter)
      }
      if (dateFrom) params.append("date_from", dateFrom)
      if (dateTo) params.append("date_to", dateTo)
      params.append("page", String(page))
      params.append("per_page", String(perPage))

      const response = await fetch(`/api/admin/excuse-duty?${params.toString()}`)

      if (!response.ok) {
        throw new Error("Unable to load excuse documents. Please try again.")
      }

      const data = await response.json()
      setExcuseDocuments(data.excuseDocuments || [])
      setHasMore(Boolean(data.pagination && data.pagination.hasMore))
    } catch (error) {
      console.error("Failed to fetch excuse documents:", error)
      setError("Failed to load excuse documents")
    } finally {
      setLoading(false)
    }
  }

  const fetchExcuseDocumentDetail = async (doc: ExcuseDocument) => {
    if (doc.file_url && doc.excuse_reason) return doc
    const response = await fetch(`/api/admin/excuse-duty?id=${encodeURIComponent(doc.id)}`, { cache: "no-store" })
    if (!response.ok) throw new Error("Unable to load document details.")
    const data = await response.json()
    return (data.excuseDocument || doc) as ExcuseDocument
  }

  const handleReview = async () => {
    if (!selectedDoc) return

    setSubmitting(true)
    try {
      const response = await fetch("/api/admin/excuse-duty", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: selectedDoc.id,
          status: reviewStatus,
          reviewNotes: reviewNotes.trim() || null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to review document")
      }

      await fetchExcuseDocuments()

      setReviewDialogOpen(false)
      setSelectedDoc(null)
      setReviewNotes("")
      setReviewStatus("approved")
    } catch (error) {
      console.error("Review error:", error)
      setError(error instanceof Error ? error.message : "Failed to review document")
    } finally {
      setSubmitting(false)
    }
  }

  const openReviewDialog = async (doc: ExcuseDocument) => {
    try {
      setSelectedDoc(await fetchExcuseDocumentDetail(doc))
      setReviewStatus("approved")
      setReviewNotes("")
      setReviewDialogOpen(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to load document details.")
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        )
      case "rejected":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        )
      case "pending":
      default:
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pending Review
          </Badge>
        )
    }
  }

  const getDocumentTypeBadge = (type: string) => {
    const colors = {
      medical: "bg-blue-100 text-blue-800 border-blue-200",
      emergency: "bg-red-100 text-red-800 border-red-200",
      personal: "bg-purple-100 text-purple-800 border-purple-200",
      official: "bg-green-100 text-green-800 border-green-200",
    }

    return (
      <Badge className={colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800 border-gray-200"}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    )
  }

  const viewDocument = async (doc: ExcuseDocument) => {
    const detailedDoc = await fetchExcuseDocumentDetail(doc)
    const fileUrl = detailedDoc.file_url || ""
    if (!fileUrl) {
      setError("Document file is not available.")
      return
    }
    if (fileUrl.startsWith("data:")) {
      // For data URLs, open directly
      window.open(fileUrl, "_blank", "width=800,height=600,scrollbars=yes,resizable=yes")
    } else {
      // For regular URLs, open directly
      window.open(fileUrl, "_blank", "width=800,height=600,scrollbars=yes,resizable=yes")
    }
  }

  const pendingCount = excuseDocuments.filter((doc) => doc.status === "pending").length
  const approvedCount = excuseDocuments.filter((doc) => doc.status === "approved").length
  const rejectedCount = excuseDocuments.filter((doc) => doc.status === "rejected").length

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading excuse documents...
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">Awaiting your review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
            <p className="text-xs text-muted-foreground">Successfully approved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
            <p className="text-xs text-muted-foreground">Rejected submissions</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Excuse Duty Submissions
              </CardTitle>
              <CardDescription>
                {userRole === "admin"
                  ? "Review excuse duty submissions from all departments"
                  : isRegionalScoped
                    ? "Review excuse duty submissions from your regional office and its district offices"
                    : "Review excuse duty submissions from your department"}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>

              <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="medical">Medical</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="official">Official</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom ?? ""}
                  onChange={(e) => setDateFrom(e.target.value || null)}
                  className="input input-sm"
                  title="From"
                />
                <input
                  type="date"
                  value={dateTo ?? ""}
                  onChange={(e) => setDateTo(e.target.value || null)}
                  className="input input-sm"
                  title="To"
                />
              </div>

              {userRole === "admin" && (
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3 w-3" />
                          {dept.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {excuseDocuments.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {statusFilter === "all" && departmentFilter === "all"
                  ? "No excuse duty submissions found"
                  : "No submissions found matching the selected filters"}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {excuseDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {doc.user_profiles?.first_name || "Unknown"} {doc.user_profiles?.last_name || ""}
                          </div>
                          <div className="text-sm text-muted-foreground">{doc.user_profiles?.employee_id || "N/A"}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{doc.user_profiles?.departments?.name || "N/A"}</div>
                          <div className="text-sm text-muted-foreground">{doc.user_profiles?.departments?.code || ""}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {new Date(doc.excuse_date).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>{getDocumentTypeBadge(doc.document_type)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm truncate max-w-[150px]" title={doc.document_name}>
                            {doc.document_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate" title={doc.excuse_reason || "Open review to view reason"}>
                          {doc.excuse_reason || "Open review to view reason"}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(doc.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewDocument(doc)}
                            className="flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </Button>
                          {doc.status === "pending" && (
                            <Button size="sm" onClick={() => openReviewDialog(doc)} className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              Review
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                      Previous
                    </Button>
                    <div className="text-sm text-muted-foreground">Page {page}</div>
                    <Button size="sm" onClick={() => hasMore && setPage((p) => p + 1)} disabled={!hasMore}>
                      Next
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-sm text-muted-foreground">Per page:</div>
                    <Select value={String(perPage)} onValueChange={(v) => setPerPage(Number(v))}>
                      <SelectTrigger className="w-[80px]">
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
          )}
        </CardContent>
      </Card>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Excuse Duty Submission</DialogTitle>
            <DialogDescription>Review and approve or reject this excuse duty submission</DialogDescription>
          </DialogHeader>

          {selectedDoc && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Staff Member</label>
                    <p className="text-sm text-muted-foreground">
                    {selectedDoc.user_profiles?.first_name || "Unknown"} {selectedDoc.user_profiles?.last_name || ""}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Department</label>
                  <p className="text-sm text-muted-foreground">{selectedDoc.user_profiles?.departments?.name || "N/A"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Date of Absence</label>
                  <p className="text-sm text-muted-foreground">
                    {new Date(selectedDoc.excuse_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Document Type</label>
                  <div className="mt-1">{getDocumentTypeBadge(selectedDoc.document_type)}</div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Reason for Absence</label>
                <p className="text-sm text-muted-foreground mt-1 p-3 bg-muted rounded-lg">
                  {selectedDoc.excuse_reason || "No reason provided."}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">Decision</label>
                <Select value={reviewStatus} onValueChange={(value: "approved" | "rejected") => setReviewStatus(value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approve</SelectItem>
                    <SelectItem value="rejected">Reject</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Review Notes (Optional)</label>
                <Textarea
                  placeholder="Add any comments or feedback..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReview} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                `${reviewStatus === "approved" ? "Approve" : "Reject"} Submission`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

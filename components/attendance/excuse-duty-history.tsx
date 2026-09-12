"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FileText, Calendar, Eye, Loader2, AlertTriangle } from "lucide-react"

interface ExcuseDocument {
  id: string
  document_name: string
  document_type: string
  file_url: string
  excuse_reason: string
  excuse_date: string
  status: "pending" | "approved" | "rejected"
  hod_status?: string | null
  hr_status?: string | null
  final_status?: string | null
  reviewed_by_profile?: {
    first_name: string
    last_name: string
  }
  reviewed_at?: string
  review_notes?: string
  created_at: string
}

export function ExcuseDutyHistory() {
  const [excuseDocuments, setExcuseDocuments] = useState<ExcuseDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchExcuseDocuments()
  }, [])

  const fetchExcuseDocuments = async () => {
    try {
      const response = await fetch("/api/attendance/excuse-duty")

      if (!response.ok) {
        throw new Error("Failed to fetch excuse documents")
      }

      const data = await response.json()
      setExcuseDocuments(data.excuseDocuments || [])
    } catch (error) {
      console.error("Failed to fetch excuse documents:", error)
      setError("Failed to load excuse documents")
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (doc: ExcuseDocument) => {
    const stage = doc.final_status || doc.status
    switch (stage) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Approved</Badge>
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>
      case "hr_review":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Awaiting HR</Badge>
      case "hod_review":
      case "pending":
      default:
        return <Badge variant="secondary">Awaiting HOD</Badge>
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

  const viewDocument = (fileUrl: string, fileName: string) => {
    if (fileUrl.startsWith("data:")) {
      // For data URLs, open directly
      window.open(fileUrl, "_blank", "width=800,height=600,scrollbars=yes,resizable=yes")
    } else {
      // For regular URLs, open directly
      window.open(fileUrl, "_blank", "width=800,height=600,scrollbars=yes,resizable=yes")
    }
  }

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          My Excuse Duty Notes
        </CardTitle>
        <CardDescription>View your submitted excuse duty notes and their review status</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
          Reviewed by your Head of Department first, then finalized by HR.
        </div>

        {excuseDocuments.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No excuse duty notes submitted yet</p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reviewed By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {excuseDocuments.map((doc) => (
                  <TableRow key={doc.id}>
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
                      <div className="max-w-[200px] truncate" title={doc.excuse_reason}>
                        {doc.excuse_reason}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(doc)}</TableCell>
                    <TableCell>
                      {doc.reviewed_by_profile ? (
                        <div className="text-sm">
                          <div>
                            {doc.reviewed_by_profile.first_name} {doc.reviewed_by_profile.last_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {doc.reviewed_at ? new Date(doc.reviewed_at).toLocaleDateString() : ""}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not reviewed</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => viewDocument(doc.file_url, doc.document_name)}
                        className="flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

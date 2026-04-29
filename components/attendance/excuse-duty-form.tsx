"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Upload, FileText, AlertTriangle, CheckCircle, Loader2 } from "lucide-react"

interface ExcuseDutyFormProps {
  onSuccess?: () => void
  onSubmitSuccess?: () => void
}

export function ExcuseDutyForm({ onSuccess, onSubmitSuccess }: ExcuseDutyFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [formData, setFormData] = useState({
    excuseDate: new Date().toISOString().split("T")[0],
    documentType: "",
    excuseReason: "",
  })

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("File size must be less than 5MB")
      return
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
    if (!allowedTypes.includes(file.type)) {
      setError("Only images (JPG, PNG), PDF, and Word documents are allowed")
      return
    }

    setSelectedFile(file)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedFile) {
      setError("Please select a document to upload")
      return
    }

    if (!formData.documentType || !formData.excuseReason.trim()) {
      setError("Please fill in all required fields")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const submitFormData = new FormData()
      submitFormData.append("file", selectedFile)
      submitFormData.append("excuseDate", formData.excuseDate)
      submitFormData.append("documentType", formData.documentType)
      submitFormData.append("excuseReason", formData.excuseReason)

      const response = await fetch("/api/attendance/excuse-duty", {
        method: "POST",
        body: submitFormData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to submit excuse duty note")
      }

      const result = await response.json()

      setSuccess(true)
      setSelectedFile(null)
      setFormData({
        excuseDate: new Date().toISOString().split("T")[0],
        documentType: "",
        excuseReason: "",
      })

      // Reset form
      const form = e.target as HTMLFormElement
      form.reset()

      if (onSuccess) {
        onSuccess()
      }
      if (onSubmitSuccess) {
        onSubmitSuccess()
      }
    } catch (error) {
      console.error("Excuse duty submission error:", error)
      setError(error instanceof Error ? error.message : "Failed to submit excuse duty note")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <FileText className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
          Submit Excuse Duty Note
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">Upload documentation for non-attendance with a valid reason</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <AlertDescription className="text-xs sm:text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
            <AlertDescription className="text-xs sm:text-sm text-green-800">
              Excuse duty note submitted successfully! It will be reviewed by your supervisor.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
            <div>
              <Label htmlFor="excuseDate" className="text-xs sm:text-sm">Date of Absence</Label>
              <Input
                id="excuseDate"
                type="date"
                value={formData.excuseDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, excuseDate: e.target.value }))}
                max={new Date().toISOString().split("T")[0]}
                required
                className="text-sm sm:text-base h-10 sm:h-11"
              />
            </div>

            <div>
              <Label htmlFor="documentType" className="text-xs sm:text-sm">Document Type</Label>
              <Select
                value={formData.documentType}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, documentType: value }))}
                required
              >
                <SelectTrigger className="text-sm sm:text-base h-10 sm:h-11">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medical">Medical Certificate</SelectItem>
                  <SelectItem value="official">Official Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="excuseReason" className="text-xs sm:text-sm">Reason for Absence</Label>
            <Textarea
              id="excuseReason"
              placeholder="Please provide a detailed explanation for your absence..."
              value={formData.excuseReason}
              onChange={(e) => setFormData((prev) => ({ ...prev, excuseReason: e.target.value }))}
              rows={3}
              required
              className="text-sm sm:text-base"
            />
          </div>

          <div>
            <Label htmlFor="document" className="text-xs sm:text-sm">Supporting Document</Label>
            <Input
              id="document"
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
              onChange={handleFileSelect}
              className="mt-1 text-sm sm:text-base h-10 sm:h-11"
              required
            />
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
              Supported formats: JPG, PNG, PDF, Word documents (max 5MB)
            </p>

            {selectedFile && (
              <div className="mt-2 p-2 sm:p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-blue-800 truncate">{selectedFile.name}</span>
                  <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </Badge>
                </div>
              </div>
            )}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-start gap-2 sm:gap-3">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs sm:text-sm text-yellow-800 min-w-0">
                <p className="font-medium">Important Notes:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Submit excuse notes within 3 days of absence</li>
                  <li>Medical certificates must be from licensed practitioners</li>
                  <li>All documents will be reviewed by your Head of Department first, then HR</li>
                  <li>False documentation may result in disciplinary action</li>
                </ul>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={loading || !selectedFile} className="w-full h-11 sm:h-12 text-sm sm:text-base">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Submit Excuse Duty Note
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

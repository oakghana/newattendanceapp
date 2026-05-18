"use client"

import { useState, useMemo } from "react"
import { format } from "date-fns"
import { Download, Loader2, FileText, Users, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface StaffOnLeave {
  id: string
  full_name: string
  employee_id: string
  department_name: string
  position: string
  staff_category: string
  start_date: string
  end_date: string
  leave_type: string
}

export function PaymentAdviceClient() {
  const { toast } = useToast()
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [isLoading, setIsLoading] = useState(false)
  const [staffList, setStaffList] = useState<StaffOnLeave[]>([])
  const [memoText, setMemoText] = useState("")
  const [showMemoEditor, setShowMemoEditor] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

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

  // Detect staff on leave for selected month
  const handleDetectStaff = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/leave/payment-advice/detect-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth }),
      })

      if (!response.ok) throw new Error("Failed to detect staff")

      const data = await response.json()
      setStaffList(data.staff || [])

      if (data.staff.length === 0) {
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
    } catch (err) {
      console.error("[v0] Error detecting staff:", err)
      toast({
        title: "Error",
        description: "Failed to detect staff on leave. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Generate memo
  const handleGenerateMemo = async () => {
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

      if (!response.ok) throw new Error("Failed to generate memo")

      const data = await response.json()
      setMemoText(data.memo)
      setShowMemoEditor(true)

      toast({
        title: "Memo Generated",
        description: "Review and edit the memo before submission.",
      })
    } catch (err) {
      console.error("[v0] Error generating memo:", err)
      toast({
        title: "Error",
        description: "Failed to generate memo. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Submit memo
  const handleSubmitMemo = async () => {
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/leave/payment-advice/submit-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          memoText,
          staffList,
        }),
      })

      if (!response.ok) throw new Error("Failed to submit memo")

      toast({
        title: "Success",
        description: "Payment advice memo has been saved successfully.",
      })

      setShowMemoEditor(false)
      setMemoText("")
      setStaffList([])
    } catch (err) {
      console.error("[v0] Error submitting memo:", err)
      toast({
        title: "Error",
        description: "Failed to submit memo. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Export staff list
  const handleExport = async (format: "excel" | "pdf") => {
    setIsExporting(true)
    try {
      const response = await fetch("/api/leave/payment-advice/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          staffList,
          format,
        }),
      })

      if (!response.ok) throw new Error("Failed to export")

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `payment-advice-${selectedMonth}.${format === "excel" ? "xlsx" : "pdf"}`
      a.click()
      window.URL.revokeObjectURL(url)

      toast({
        title: "Exported",
        description: `Staff list exported as ${format.toUpperCase()}.`,
      })
    } catch (err) {
      console.error("[v0] Error exporting:", err)
      toast({
        title: "Error",
        description: "Failed to export staff list. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Month Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Select Month for Payment Advice
          </CardTitle>
          <CardDescription>Choose the month to generate payment advice for annual leave</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="month-select" className="mb-2 block">
                Month
              </Label>
              <Input
                id="month-select"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>
            <Button onClick={handleDetectStaff} disabled={isLoading} className="gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Detect Staff
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Staff List Preview */}
      {staffList.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" />
                Staff on Annual Leave ({staffList.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Category Summary */}
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(staffByCategory).map(([category, staff]) => (
                  <Card key={category} className="bg-gradient-to-br from-slate-50 to-slate-100">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-slate-800">{(staff as StaffOnLeave[]).length}</div>
                        <div className="text-sm text-slate-600 mt-1">{category} Staff</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Staff Table */}
              <div className="overflow-x-auto mt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-300 bg-slate-50">
                      <th className="text-left py-2 px-3 font-semibold">Staff No.</th>
                      <th className="text-left py-2 px-3 font-semibold">Name</th>
                      <th className="text-left py-2 px-3 font-semibold">Department</th>
                      <th className="text-left py-2 px-3 font-semibold">Position</th>
                      <th className="text-left py-2 px-3 font-semibold">Category</th>
                      <th className="text-left py-2 px-3 font-semibold">Leave Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((staff, idx) => (
                      <tr key={staff.id} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="py-3 px-3">{idx + 1}</td>
                        <td className="py-3 px-3 font-medium">{staff.full_name}</td>
                        <td className="py-3 px-3">{staff.department_name}</td>
                        <td className="py-3 px-3">{staff.position}</td>
                        <td className="py-3 px-3">
                          <Badge
                            variant={
                              staff.staff_category === "Manager"
                                ? "default"
                                : staff.staff_category === "Senior"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {staff.staff_category}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {format(new Date(staff.start_date), "MMM d")} - {format(new Date(staff.end_date), "MMM d")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6">
                <Button
                  onClick={handleGenerateMemo}
                  disabled={isLoading}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Generate Memo
                </Button>
                <Button
                  onClick={() => handleExport("excel")}
                  disabled={isExporting}
                  variant="outline"
                  className="gap-2"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Export Excel
                </Button>
                <Button
                  onClick={() => handleExport("pdf")}
                  disabled={isExporting}
                  variant="outline"
                  className="gap-2"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Export PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty State */}
      {staffList.length === 0 && !isLoading && (
        <Card className="border-dashed border-2 border-slate-300">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">Select a month and detect staff to begin generating payment advice</p>
          </CardContent>
        </Card>
      )}

      {/* Memo Editor Dialog */}
      <Dialog open={showMemoEditor} onOpenChange={setShowMemoEditor}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Advice Memo - {selectedMonth}</DialogTitle>
            <DialogDescription>Review and edit the memo before submission</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              rows={20}
              className="font-mono text-sm"
              placeholder="Memo content..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMemoEditor(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitMemo}
              disabled={isSubmitting || !memoText.trim()}
              className="gap-2"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit Memo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Import missing icon
import { Calendar } from "lucide-react"

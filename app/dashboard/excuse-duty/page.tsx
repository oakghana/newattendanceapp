"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ExcuseDutyForm } from "@/components/attendance/excuse-duty-form"
import { ExcuseDutyHistory } from "@/components/attendance/excuse-duty-history"
import { FileText, Clock, CheckCircle2, XCircle } from "lucide-react"

export default function ExcuseDutyPage() {
  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit")
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 })

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/attendance/excuse-duty")
        if (response.ok) {
          const data = await response.json()
          const docs = data.excuseDocuments || []
          setStats({
            total: docs.length,
            pending: docs.filter((doc: any) => doc.final_status === "pending" || doc.final_status === "hod_review" || doc.status === "pending").length,
            approved: docs.filter((doc: any) => doc.final_status === "approved" || doc.status === "approved").length,
            rejected: docs.filter((doc: any) => doc.final_status === "rejected" || doc.status === "rejected").length,
          })
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error)
      }
    }
    fetchStats()
  }, [activeTab, historyRefreshKey])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Excuse Duty</h1>
        <p className="text-muted-foreground mt-2">
          Submit documentation for non-attendance and track its review status in one place.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
          <FileText className="h-3.5 w-3.5" /> {stats.total} Total
        </Badge>
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-amber-200 bg-amber-50 text-amber-700">
          <Clock className="h-3.5 w-3.5" /> {stats.pending} Pending
        </Badge>
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-emerald-200 bg-emerald-50 text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> {stats.approved} Approved
        </Badge>
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-red-200 bg-red-50 text-red-700">
          <XCircle className="h-3.5 w-3.5" /> {stats.rejected} Rejected
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "submit" | "history")} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2 rounded-xl border border-slate-200 bg-slate-100/80 p-1">
          <TabsTrigger value="submit" className="rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            New Request
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            My Submissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="submit">
          <ExcuseDutyForm
            onSubmitSuccess={() => {
              setHistoryRefreshKey((prev) => prev + 1)
              setActiveTab("history")
            }}
          />
        </TabsContent>

        <TabsContent value="history">
          <ExcuseDutyHistory key={historyRefreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  )
}


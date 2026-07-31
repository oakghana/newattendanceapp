"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Link2, Loader2, CheckCircle, AlertTriangle } from "lucide-react"

interface AutoLinkStats {
  total: number
  linked: number
  skipped: number
}

interface LinkResult {
  staffId: string
  hodId: string
  hodName: string
  hodRole: string
}

export function AutoLinkHodButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [stats, setStats] = useState<AutoLinkStats | null>(null)
  const [results, setResults] = useState<LinkResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleAutoLink = async () => {
    setIsLoading(true)
    setError(null)
    setStats(null)
    setResults([])

    try {
      const response = await fetch("/api/admin/auto-link-hods", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to auto-link HODs")
      }

      setStats(data.stats)
      setResults(data.links || [])
    } catch (err: any) {
      setError(err.message || "An error occurred during auto-linking")
      console.error("[v0] Auto-link error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setShowDialog(true)
          setStats(null)
          setResults([])
          setError(null)
        }}
        disabled={isLoading}
        className="gap-2"
      >
        <Link2 className="h-4 w-4" />
        {isLoading ? "Linking..." : "Auto-Link HODs"}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Auto-Link Staff to HODs</DialogTitle>
            <DialogDescription>
              Automatically link all staff members to their available HODs in their department and location
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {stats && (
              <div className="space-y-4">
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Successfully linked {stats.linked} staff members to HODs
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium text-muted-foreground">Total Staff</div>
                    <div className="text-2xl font-bold">{stats.total}</div>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <div className="text-sm font-medium text-green-700">Linked</div>
                    <div className="text-2xl font-bold text-green-700">{stats.linked}</div>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="text-sm font-medium text-amber-700">Skipped</div>
                    <div className="text-2xl font-bold text-amber-700">{stats.skipped}</div>
                  </div>
                </div>

                {results.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold">Linkage Details:</h4>
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {results.slice(0, 10).map((result, idx) => (
                        <div key={idx} className="rounded border border-gray-200 bg-gray-50 p-2 text-sm">
                          <p className="font-medium">
                            {result.hodName} ({result.hodRole})
                          </p>
                          <p className="text-xs text-muted-foreground">Linked to staff ID: {result.staffId}</p>
                        </div>
                      ))}
                      {results.length > 10 && (
                        <p className="text-xs text-muted-foreground italic">... and {results.length - 10} more linkages</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!stats && !error && (
              <Alert>
                <AlertDescription>
                  This will link all active staff members to their available HODs in the same department and location.
                  <br />
                  <br />
                  <strong>Eligible HOD roles:</strong>
                  <ul className="mt-2 ml-4 list-disc space-y-1 text-sm">
                    <li>HR Executive</li>
                    <li>Accounts Executive</li>
                    <li>Regional Manager</li>
                    <li>Departmental Head</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={isLoading}>
              {stats ? "Close" : "Cancel"}
            </Button>
            {!stats && (
              <Button onClick={handleAutoLink} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? "Linking..." : "Start Auto-Link"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

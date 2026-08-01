"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Lock, LockOpen, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

interface RequestLockIndicatorProps {
  requestId: string
  requestType?: "loan" | "leave"
  staffId?: string
  onLockStatusChange?: (isLocked: boolean, lockedBy?: { name: string; id: string }) => void
  disabled?: boolean
}

export function RequestLockIndicator({
  requestId,
  requestType = "loan",
  staffId,
  onLockStatusChange,
  disabled = false,
}: RequestLockIndicatorProps) {
  const [lockStatus, setLockStatus] = useState<{
    locked: boolean
    locked_by_you: boolean
    locked_by_other?: { name: string; id: string }
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [linkedHods, setLinkedHods] = useState<any[]>([])
  const { toast } = useToast()

  // Fetch linked HODs info and lock status
  useEffect(() => {
    const fetchLockStatus = async () => {
      try {
        setLoading(true)
        const response = await fetch(
          `/api/loan/hod-linkages?staffId=${staffId || ""}&requestId=${requestId}&requestType=${requestType}`,
        )
        const data = await response.json()

        setLinkedHods(data.linked_hods || [])
        setLockStatus(data.lock_status)

        if (onLockStatusChange && data.lock_status) {
          onLockStatusChange(
            Boolean(data.lock_status.locked_by),
            data.lock_status.locked_by
              ? {
                  name: data.lock_status.locked_by_name,
                  id: data.lock_status.locked_by,
                }
              : undefined,
          )
        }
      } catch (error) {
        console.error("[v0] Error fetching lock status:", error)
      } finally {
        setLoading(false)
      }
    }

    if (requestId && staffId) {
      void fetchLockStatus()
    }
  }, [requestId, staffId, requestType, onLockStatusChange])

  const attemptLock = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/loan/lock-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, requestType }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.locked_by_other) {
          toast({
            title: "Request Locked",
            description: `This request is currently being processed by ${data.locked_by_other.name}. Please wait for them to complete or contact them.`,
            variant: "destructive",
          })
        } else {
          toast({
            title: "Error",
            description: data.message || "Failed to lock request",
            variant: "destructive",
          })
        }
        return
      }

      setLockStatus({
        locked: false,
        locked_by_you: true,
      })

      toast({
        title: "Request Locked",
        description: "You have locked this request. Other HODs will see it as in-progress.",
      })

      if (onLockStatusChange) {
        onLockStatusChange(false)
      }
    } catch (error) {
      console.error("[v0] Lock error:", error)
      toast({
        title: "Error",
        description: "Failed to lock request",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Show nothing if request has no lock holder
  if (!lockStatus || (!lockStatus.locked && lockStatus.locked_by_you)) {
    if (lockStatus?.locked_by_you) {
      return (
        <Alert className="border-green-200 bg-green-50">
          <Lock className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            You have locked this request. Other HODs cannot edit it now.
          </AlertDescription>
        </Alert>
      )
    }
    return null
  }

  // Show lock-by-other alert
  if (lockStatus?.locked_by_other && !lockStatus.locked_by_you) {
    return (
      <Alert className="border-amber-200 bg-amber-50">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertDescription>
          <div className="space-y-2">
            <div className="text-amber-800">
              This request is currently being processed by{" "}
              <strong>{lockStatus.locked_by_other.name}</strong>. You cannot edit it right now.
            </div>
            <div className="text-sm text-amber-700">
              If they&apos;re done, they can release the lock, or you can contact them to coordinate.
            </div>

            {linkedHods.length > 1 && (
              <div className="mt-2 text-xs text-amber-700">
                <div className="font-semibold">Other linked HODs for this staff:</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {linkedHods.map((hod: any) => (
                    <Badge
                      key={hod.id}
                      variant={hod.id === lockStatus.locked_by_other?.id ? "default" : "outline"}
                      className="text-xs"
                    >
                      {hod.name}
                      {hod.id === lockStatus.locked_by_other?.id && " (Processing)"}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  // Show option to lock if not locked
  if (!lockStatus?.locked && !lockStatus?.locked_by_you && !disabled) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3">
        <div className="flex items-center gap-2">
          <LockOpen className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-900">This request is available to edit</span>

          {linkedHods.length > 1 && (
            <div className="text-xs text-blue-700">
              ({linkedHods.length} HODs linked to this staff)
            </div>
          )}
        </div>
        <Button
          size="sm"
          onClick={attemptLock}
          disabled={loading}
          className="ml-2"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
          {loading ? "Locking..." : "Lock for Editing"}
        </Button>
      </div>
    )
  }

  return null
}

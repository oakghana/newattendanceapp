"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Clock, AlertTriangle, CheckCircle2, Volume2, VolumeX } from "lucide-react"
import { differenceInDays, parseISO, format } from "date-fns"

interface ResumptionCountdownData {
  id: string
  staff_name: string
  leave_type: string
  end_date: string
  resume_date: string
  days_left: number
  status?: string
}

interface ResumptionCountdownWidgetProps {
  onMute?: (isMuted: boolean) => void
  autoPlaySound?: boolean
}

export function ResumptionCountdownWidget({ onMute, autoPlaySound = true }: ResumptionCountdownWidgetProps) {
  const [countdowns, setCountdowns] = useState<ResumptionCountdownData[]>([])
  const [loading, setLoading] = useState(true)
  const [soundMuted, setSoundMuted] = useState(true)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Fetch resumption countdowns on mount
  useEffect(() => {
    fetchCountdowns()
    // Refresh every 60 seconds
    const interval = setInterval(fetchCountdowns, 60000)
    return () => clearInterval(interval)
  }, [])

  // Play warning sound for critical countdowns
  useEffect(() => {
    if (countdowns.length > 0 && autoPlaySound && !soundMuted) {
      const criticalItems = countdowns.filter(c => c.days_left <= 3)
      if (criticalItems.length > 0 && audioRef.current) {
        playWarningSound()
      }
    }
  }, [countdowns, autoPlaySound, soundMuted])

  const fetchCountdowns = async () => {
    try {
      const response = await fetch("/api/leave/reminders/resume-five-days-countdown")
      if (response.ok) {
        const data = await response.json()
        setCountdowns(data.countdowns || [])
      }
    } catch (error) {
      console.error("[v0] Error fetching resumption countdowns:", error)
    } finally {
      setLoading(false)
    }
  }

  const playWarningSound = () => {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 800 // 800 Hz beep
    oscillator.type = "sine"

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)
  }

  const toggleSound = () => {
    setSoundMuted(!soundMuted)
    onMute?.(!soundMuted)
  }

  if (loading) {
    return (
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="text-center text-sm text-gray-600">Loading resumption countdowns...</div>
        </CardContent>
      </Card>
    )
  }

  const hasCritical = countdowns.some(c => c.days_left <= 3)
  const hasWarning = countdowns.some(c => c.days_left <= 5 && c.days_left > 3)

  if (countdowns.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      {hasCritical && (
        <Alert className="border-red-300 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            ⚠️ <strong>CRITICAL:</strong> {countdowns.filter(c => c.days_left <= 3).length} staff member(s) returning to work within 3 days!
          </AlertDescription>
        </Alert>
      )}

      {hasWarning && !hasCritical && (
        <Alert className="border-yellow-300 bg-yellow-50">
          <Clock className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            ⏰ <strong>REMINDER:</strong> {countdowns.filter(c => c.days_left <= 5).length} staff member(s) returning within 5 days.
          </AlertDescription>
        </Alert>
      )}

      {/* Sound Control */}
      <div className="flex justify-end gap-2">
        <button
          onClick={toggleSound}
          className="flex items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
        >
          {soundMuted ? (
            <>
              <VolumeX className="h-4 w-4" />
              <span>Sound Off</span>
            </>
          ) : (
            <>
              <Volume2 className="h-4 w-4" />
              <span>Sound On</span>
            </>
          )}
        </button>
      </div>

      {/* Countdown Cards */}
      <div className="grid gap-3">
        {countdowns.map(countdown => {
          const daysLeft = countdown.days_left
          const progress = ((5 - daysLeft) / 5) * 100
          const urgencyColor =
            daysLeft <= 2
              ? "border-red-300 bg-red-50"
              : daysLeft <= 3
                ? "border-orange-300 bg-orange-50"
                : daysLeft <= 5
                  ? "border-yellow-300 bg-yellow-50"
                  : "border-blue-300 bg-blue-50"

          const urgencyEmoji =
            daysLeft <= 2
              ? "🚨"
              : daysLeft <= 3
                ? "⚠️"
                : daysLeft <= 5
                  ? "⏰"
                  : "✓"

          return (
            <Card key={countdown.id} className={`border-2 ${urgencyColor}`}>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {/* Header with name and urgency */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{urgencyEmoji}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{countdown.staff_name}</p>
                        <p className="text-xs text-gray-600">{countdown.leave_type}</p>
                      </div>
                    </div>
                    <Badge
                      variant={daysLeft <= 3 ? "destructive" : "secondary"}
                      className="text-base"
                    >
                      {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                    </Badge>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded bg-white p-2">
                      <p className="text-xs text-gray-600">Leave Ends</p>
                      <p className="font-medium text-gray-900">
                        {format(parseISO(countdown.end_date), "MMM dd, yyyy")}
                      </p>
                    </div>
                    <div className="rounded bg-white p-2">
                      <p className="text-xs text-gray-600">Resume Date</p>
                      <p className="font-medium text-gray-900">
                        {format(parseISO(countdown.resume_date), "MMM dd, yyyy")}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="mb-2 flex justify-between text-xs">
                      <span className="text-gray-600">Time remaining</span>
                      <span className="font-medium text-gray-900">{Math.max(0, 5 - daysLeft)} of 5 days</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  {/* Warning Message for Critical */}
                  {daysLeft <= 3 && (
                    <Alert className="border-red-200 bg-red-50 p-3">
                      <AlertTriangle className="h-3 w-3 text-red-600" />
                      <AlertDescription className="text-xs text-red-700">
                        ⚠️ <strong>Action Required:</strong> Please ensure all materials are prepared for {countdown.staff_name}&apos;s return to work. HR office should follow up if any issues are anticipated.
                      </AlertDescription>
                    </Alert>
                  )}

                  {daysLeft === 1 && (
                    <Alert className="border-red-300 bg-red-100 p-3">
                      <AlertTriangle className="h-3 w-3 text-red-700" />
                      <AlertDescription className="text-xs text-red-800">
                        🚨 <strong>URGENT:</strong> {countdown.staff_name} is expected to return TOMORROW. Please ensure all preparatory measures are complete.
                      </AlertDescription>
                    </Alert>
                  )}

                  {daysLeft === 0 && (
                    <Alert className="border-green-300 bg-green-50 p-3">
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      <AlertDescription className="text-xs text-green-700">
                        ✓ {countdown.staff_name} is resuming work TODAY. Welcome back!
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* HR Office Instructions */}
      {countdowns.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">📋 HR Leave Office Instructions</CardTitle>
            <CardDescription>Guidelines for staff returning to work</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="space-y-1 text-gray-700">
              <li>✓ Verify return-to-work documentation from all staff with countdowns</li>
              <li>⚠️ Contact any staff showing as critical (≤3 days) if issues arise</li>
              <li>📞 Prepare welcome-back briefings for days 1-3 before return</li>
              <li>📝 Document any non-resumption issues with warnings and queries</li>
              <li>📊 Maintain records of all staff deferrals or extensions requested</li>
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Audio element for warning sounds */}
      <audio ref={audioRef} />
    </div>
  )
}

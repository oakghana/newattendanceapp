"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { toast } from "sonner"
import { BellRing, CalendarPlus, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type LeaveReminder = {
  id: string
  message: string
  sender_label: string | null
  created_at: string
  data: { year?: string; sender_name?: string } | null
}

const REMINDERS_URL = "/api/staff/leave-reminders"
const POLL_MS = 60_000

async function fetchReminders(url: string): Promise<LeaveReminder[]> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return []
  const json = await res.json()
  return Array.isArray(json.reminders) ? json.reminders : []
}

// Three rising notes, played twice. Generated with Web Audio so no asset is needed.
function playChime(context: AudioContext) {
  const notes = [659.25, 783.99, 987.77]
  const start = context.currentTime + 0.02
  for (let round = 0; round < 2; round++) {
    notes.forEach((frequency, index) => {
      const at = start + round * 0.9 + index * 0.22
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = "sine"
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(at)
      oscillator.stop(at + 0.4)
    })
  }
}

export function LeaveReminderModal() {
  const router = useRouter()
  const { data: reminders = [], mutate } = useSWR<LeaveReminder[]>(REMINDERS_URL, fetchReminders, {
    refreshInterval: POLL_MS,
    revalidateOnFocus: true,
  })
  const [open, setOpen] = useState(false)
  const shownKeyRef = useRef("")
  const audioRef = useRef<AudioContext | null>(null)

  const sound = useCallback(() => {
    try {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctor) return
      const context = audioRef.current ?? new Ctor()
      audioRef.current = context
      if (context.state === "suspended") {
        // Browsers block audio until the user has interacted with the page;
        // wait for the first interaction and play then.
        const resume = () => {
          context.resume().then(() => playChime(context)).catch(() => {})
        }
        window.addEventListener("pointerdown", resume, { once: true })
        window.addEventListener("keydown", resume, { once: true })
        return
      }
      playChime(context)
    } catch {
      // Sound is a nicety; the modal and push notification still work without it.
    }
  }, [])

  const markSeen = useCallback(
    async (ids: string[]) => {
      setOpen(false)
      if (ids.length === 0) return
      await fetch(REMINDERS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }).catch(() => {})
      mutate([], { revalidate: false })
    },
    [mutate],
  )

  useEffect(() => {
    const key = reminders.map((r) => r.id).join(",")
    if (!key) {
      shownKeyRef.current = ""
      setOpen(false)
      return
    }
    if (key === shownKeyRef.current) return
    shownKeyRef.current = key
    setOpen(true)
    sound()
    toast.warning("Annual leave reminder", {
      description: reminders[0]?.message,
      duration: 12_000,
      action: { label: "Apply now", onClick: () => router.push("/dashboard/leave-management") },
    })
  }, [reminders, router, sound])

  // The service worker pings every open tab when a push arrives, so the modal
  // appears instantly instead of waiting for the next poll.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "qcc-push" && event.data?.kind === "leave-reminder") mutate()
    }
    navigator.serviceWorker.addEventListener("message", onMessage)
    return () => navigator.serviceWorker.removeEventListener("message", onMessage)
  }, [mutate])

  const latest = reminders[0]
  const ids = reminders.map((r) => r.id)
  const year = latest?.data?.year
  const sender = latest?.data?.sender_name || latest?.sender_label || "Your supervisor"

  return (
    <Dialog open={open} onOpenChange={(next) => !next && markSeen(ids)}>
      <DialogContent className="max-w-md border-amber-300 text-center sm:rounded-2xl">
        <DialogHeader className="items-center space-y-3">
          <span className="relative flex h-16 w-16 items-center justify-center" aria-hidden="true">
            <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/40" />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <BellRing className="h-8 w-8 animate-pulse" />
            </span>
          </span>
          <DialogTitle className="text-balance text-xl">Submit your annual leave</DialogTitle>
          <DialogDescription className="text-pretty">
            {sender}
            {latest?.sender_label && latest.data?.sender_name ? ` (${latest.sender_label})` : ""} is reminding you that
            your {year ? `${year} ` : ""}annual leave request has not been submitted yet.
          </DialogDescription>
        </DialogHeader>

        {latest && (
          <p className="rounded-lg bg-muted p-3 text-left text-sm leading-relaxed text-foreground">{latest.message}</p>
        )}

        <DialogFooter className="gap-2 sm:justify-center">
          <Button variant="outline" onClick={() => markSeen(ids)}>
            <Clock className="mr-2 h-4 w-4" aria-hidden="true" />
            Remind me later
          </Button>
          <Button
            onClick={() => {
              markSeen(ids)
              router.push("/dashboard/leave-management")
            }}
          >
            <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            Apply now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

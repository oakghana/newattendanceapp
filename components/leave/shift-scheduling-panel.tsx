"use client"

import { useEffect, useState, type DragEvent, type FormEvent } from "react"
import { addDays, format, startOfWeek } from "date-fns"
import { CalendarDays, GripVertical, Plus, RefreshCw, Repeat2, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"

type Staff = { id: string; first_name?: string | null; last_name?: string | null; employee_id?: string | null }
type Pattern = { id: string; name: string; code: string; start_time: string; end_time: string; color: string }
type Assignment = { id: string; employee_id: string; shift_pattern_id: string; shift_date: string }
type Leave = { user_id: string; preferred_start_date: string; preferred_end_date: string; adjusted_start_date?: string | null; adjusted_end_date?: string | null }
type ScheduleData = { canManage: boolean; staff: Staff[]; patterns: Pattern[]; assignments: Assignment[]; leaves: Leave[]; swaps: { id: string; status: string; shift_assignment_id: string; target_employee_id: string }[] }

function displayName(staff: Staff) { return `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim() || staff.employee_id || "Staff member" }

export function ShiftSchedulingPanel({ userId }: { userId: string }) {
  const [data, setData] = useState<ScheduleData | null>(null)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newPatternOpen, setNewPatternOpen] = useState(false)
  const [swapAssignment, setSwapAssignment] = useState<Assignment | null>(null)
  const week = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))

  async function load() {
    setLoading(true)
    const response = await fetch(`/api/leave/shifts?month=${format(weekStart, "yyyy-MM")}`)
    const body = await response.json().catch(() => null)
    setLoading(false)
    if (!response.ok) return toast({ title: "Unable to load shift schedule", description: body?.error ?? "Please try again.", variant: "destructive" })
    setData(body)
  }
  useEffect(() => { void load() }, [weekStart])

  function onDragStart(event: DragEvent<HTMLDivElement>, pattern: Pattern) { event.dataTransfer.setData("application/shift-pattern", pattern.id); event.dataTransfer.effectAllowed = "copy" }
  async function assign(event: DragEvent<HTMLDivElement>, employeeId: string, date: Date) {
    event.preventDefault(); const patternId = event.dataTransfer.getData("application/shift-pattern")
    if (!patternId || !data?.canManage) return
    setSaving(true)
    const response = await fetch("/api/leave/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: employeeId, shift_pattern_id: patternId, shift_date: format(date, "yyyy-MM-dd") }) })
    const body = await response.json().catch(() => null); setSaving(false)
    if (!response.ok) return toast({ title: "Shift conflict", description: body?.error ?? "Unable to assign shift.", variant: "destructive" })
    setData((current) => current ? { ...current, assignments: [...current.assignments, body.assignment] } : current)
  }
  async function createPattern(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); const form = new FormData(event.currentTarget)
    const response = await fetch("/api/leave/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pattern", ...Object.fromEntries(form) }) })
    const body = await response.json().catch(() => null); setSaving(false)
    if (!response.ok) return toast({ title: "Unable to create shift", description: body?.error ?? "Please try again.", variant: "destructive" })
    setData((current) => current ? { ...current, patterns: [...current.patterns, body.pattern] } : current); setNewPatternOpen(false)
  }
  async function requestSwap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!swapAssignment) return
    const form = new FormData(event.currentTarget); setSaving(true)
    const response = await fetch("/api/leave/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "swap", assignment_id: swapAssignment.id, target_employee_id: form.get("target_employee_id"), note: form.get("note") }) })
    const body = await response.json().catch(() => null); setSaving(false)
    if (!response.ok) return toast({ title: "Unable to request swap", description: body?.error ?? "Please try again.", variant: "destructive" })
    setData((current) => current ? { ...current, swaps: [body.swap, ...current.swaps] } : current); setSwapAssignment(null); toast({ title: "Swap request sent" })
  }

  if (loading && !data) return <Card><CardContent className="flex items-center justify-center p-12 text-sm text-muted-foreground"><RefreshCw className="mr-2 size-4 animate-spin" /> Loading shift schedule...</CardContent></Card>
  if (!data) return null
  const patternById = new Map(data.patterns.map((pattern) => [pattern.id, pattern]))
  const assignmentFor = (employeeId: string, date: Date) => data.assignments.find((assignment) => assignment.employee_id === employeeId && assignment.shift_date === format(date, "yyyy-MM-dd"))
  const onLeave = (employeeId: string, date: Date) => data.leaves.some((leave) => { const start = leave.adjusted_start_date || leave.preferred_start_date; const end = leave.adjusted_end_date || leave.preferred_end_date; const day = format(date, "yyyy-MM-dd"); return leave.user_id === employeeId && start <= day && end >= day })

  return <div className="space-y-5"><header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-teal-500/10 text-teal-700"><CalendarDays className="size-5" /></div><div><p className="text-sm font-medium text-teal-700">Leave administration</p><h2 className="text-2xl font-semibold tracking-tight">Shift scheduling</h2></div></div><p className="mt-2 text-sm text-muted-foreground">Schedule operational coverage around approved leave and manage staff shift-swap requests.</p></div>{data.canManage && <Button onClick={() => setNewPatternOpen(true)}><Plus data-icon="inline-start" /> New shift pattern</Button>}</header>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>Previous week</Button><Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>This week</Button><Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next week</Button></div><Button variant="ghost" size="icon" title="Refresh schedule" onClick={() => void load()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></Button></div>
    {data.canManage && <Card><CardHeader><CardTitle className="text-base">Shift patterns</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{data.patterns.map((pattern) => <div key={pattern.id} draggable onDragStart={(event) => onDragStart(event, pattern)} className="flex cursor-grab items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-sm active:cursor-grabbing"><GripVertical className="size-4 text-muted-foreground" /><span className="size-2.5 rounded-full" style={{ backgroundColor: pattern.color }} /><span className="font-medium">{pattern.code}</span><span className="text-muted-foreground">{pattern.start_time.slice(0, 5)}-{pattern.end_time.slice(0, 5)}</span></div>)}{data.patterns.length === 0 && <p className="text-sm text-muted-foreground">Create a shift pattern before scheduling staff.</p>}</CardContent></Card>}
    <Card><CardContent className="overflow-x-auto p-0"><div className="min-w-[900px]"><div className="grid grid-cols-[200px_repeat(7,minmax(100px,1fr))] border-b bg-muted/30"><div className="p-3 text-sm font-medium">Staff</div>{week.map((date) => <div key={date.toISOString()} className="border-l p-3 text-center"><p className="text-xs text-muted-foreground">{format(date, "EEE")}</p><p className="font-semibold">{format(date, "d MMM")}</p></div>)}</div>{data.staff.map((member) => <div key={member.id} className="grid grid-cols-[200px_repeat(7,minmax(100px,1fr))] border-b last:border-0"><div className="p-3"><p className="text-sm font-medium">{displayName(member)}</p><p className="text-xs text-muted-foreground">{member.employee_id || ""}</p></div>{week.map((date) => { const assignment = assignmentFor(member.id, date); const pattern = assignment ? patternById.get(assignment.shift_pattern_id) : null; const leave = onLeave(member.id, date); return <div key={date.toISOString()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void assign(event, member.id, date)} className={`min-h-20 border-l p-2 ${leave ? "bg-amber-50" : ""}`}>{leave ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">On leave</Badge> : pattern ? <button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-white" style={{ backgroundColor: pattern.color }} onClick={() => assignment?.employee_id === userId && setSwapAssignment(assignment)}>{pattern.code}<span className="mt-1 block font-normal opacity-90">{pattern.start_time.slice(0, 5)}-{pattern.end_time.slice(0, 5)}</span></button> : <span className="text-xs text-muted-foreground">{data.canManage ? "Drop shift here" : "-"}</span>}</div> })}</div>)}</div></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Repeat2 className="size-5" /> Shift swaps</CardTitle></CardHeader><CardContent>{data.swaps.length ? <ul className="divide-y">{data.swaps.map((swap) => <li key={swap.id} className="flex items-center justify-between py-3 text-sm"><span>Swap request</span><Badge variant={swap.status === "pending" ? "secondary" : "outline"}>{swap.status}</Badge></li>)}</ul> : <p className="text-sm text-muted-foreground">No shift swap requests are awaiting action.</p>}</CardContent></Card>
    <Dialog open={newPatternOpen} onOpenChange={setNewPatternOpen}><DialogContent><DialogHeader><DialogTitle>Create shift pattern</DialogTitle></DialogHeader><form className="grid gap-4" onSubmit={createPattern}><div className="grid gap-2"><Label>Name</Label><Input name="name" required placeholder="Morning shift" /></div><div className="grid gap-2"><Label>Code</Label><Input name="code" required placeholder="MOR" maxLength={10} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>Start</Label><Input name="start_time" type="time" required /></div><div className="grid gap-2"><Label>End</Label><Input name="end_time" type="time" required /></div></div><div className="grid gap-2"><Label>Colour</Label><Input name="color" type="color" defaultValue="#0f766e" /></div><DialogFooter><Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create pattern"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(swapAssignment)} onOpenChange={(open) => !open && setSwapAssignment(null)}><DialogContent><DialogHeader><DialogTitle>Request shift swap</DialogTitle></DialogHeader><form className="grid gap-4" onSubmit={requestSwap}><div className="grid gap-2"><Label>Swap with</Label><Select name="target_employee_id" required><SelectTrigger className="w-full"><SelectValue placeholder="Select colleague" /></SelectTrigger><SelectContent>{data.staff.filter((member) => member.id !== userId).map((member) => <SelectItem key={member.id} value={member.id}>{displayName(member)}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Note</Label><Textarea name="note" placeholder="Reason for the requested swap" /></div><DialogFooter><Button type="submit" disabled={saving}>{saving ? "Sending..." : "Send request"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>
}
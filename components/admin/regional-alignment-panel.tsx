"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Link2, Loader2, MapPin, RefreshCw } from "lucide-react"
import { toast } from "sonner"

type Location = { id: string; name: string; address?: string }
type User = { id: string; first_name: string; last_name: string; role: string; assigned_location_id?: string; is_active: boolean }
type Assignment = { location_id: string; regional_hr_user_id?: string | null; regional_manager_user_id?: string | null }

function normalizeRole(role: string) { return role.toLowerCase().replace(/[-\s]+/g, "_") }

export function RegionalAlignmentPanel() {
  const [locations, setLocations] = useState<Location[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch("/api/admin/regional-alignments", { credentials: "same-origin", cache: "no-store" })
    const result = await response.json()
    if (!response.ok) { toast.error(result.error || "Failed to load regional alignments"); setLoading(false); return }
    setLocations(result.locations || [])
    setUsers(result.eligibleUsers || [])
    setAssignments(result.assignments || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const hrUsers = useMemo(() => users.filter((user) => normalizeRole(user.role).includes("regional_hr") || ["hr", "hr_office"].includes(normalizeRole(user.role))), [users])
  const managerUsers = useMemo(() => users.filter((user) => ["regional_manager", "regional_manager_office", "regionalmanager"].includes(normalizeRole(user.role))), [users])
  const filteredLocations = useMemo(() => locations.filter((location) => `${location.name} ${location.address || ""}`.toLowerCase().includes(search.toLowerCase())), [locations, search])
  const assignmentFor = (locationId: string) => assignments.find((assignment) => assignment.location_id === locationId)
  const selectedHr = (locationId: string) => assignmentFor(locationId)?.regional_hr_user_id || "none"
  const selectedManager = (locationId: string) => assignmentFor(locationId)?.regional_manager_user_id || "none"
  const userName = (id: string) => { const user = users.find((item) => item.id === id); return user ? `${user.first_name} ${user.last_name}` : "Unassigned" }

  const save = async (locationId: string, kind: "hr" | "manager", value: string) => {
    setSaving(locationId)
    const response = await fetch("/api/admin/regional-alignments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      locationId,
      regionalHrUserId: kind === "hr" && value !== "none" ? value : selectedHr(locationId) === "none" ? null : selectedHr(locationId),
      regionalManagerUserId: kind === "manager" && value !== "none" ? value : selectedManager(locationId) === "none" ? null : selectedManager(locationId),
    }) })
    const result = await response.json()
    if (!response.ok) toast.error(result.error || "Failed to save alignment")
    else { toast.success("Regional alignment saved"); await load() }
    setSaving(null)
  }

  return <Card className="border-primary/20">
    <CardHeader>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" />Regional workflow alignment</CardTitle><CardDescription>Set one location mapping. Regional staff, Regional HR, and Regional Manager assignments then follow the same location automatically.</CardDescription></div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <Alert><AlertDescription>Only administrators and IT administrators can change these links. A Regional Manager must belong to the same location; regional leave is routed to the linked Regional HR officer first.</AlertDescription></Alert>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search locations" aria-label="Search locations" />
      {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading alignments…</div> : <div className="space-y-3">{filteredLocations.map((location) => { const currentHr = selectedHr(location.id); const currentManager = selectedManager(location.id); return <div key={location.id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><MapPin className="mt-1 h-4 w-4 text-primary" /><div><p className="font-medium">{location.name}</p><p className="text-xs text-muted-foreground">{location.address || "No address"}</p></div></div><div className="grid w-full gap-2 sm:grid-cols-2 md:w-[600px]"><div><Label htmlFor={`manager-${location.id}`} className="text-xs">Regional Manager</Label><Select value={currentManager} onValueChange={(value) => save(location.id, "manager", value)} disabled={saving === location.id}><SelectTrigger id={`manager-${location.id}`}><SelectValue placeholder="Select manager" /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{managerUsers.map((user) => <SelectItem key={user.id} value={user.id}>{userName(user.id)}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor={`hr-${location.id}`} className="text-xs">Regional HR Office</Label><Select value={currentHr} onValueChange={(value) => save(location.id, "hr", value)} disabled={saving === location.id}><SelectTrigger id={`hr-${location.id}`}><SelectValue placeholder="Select Regional HR" /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{hrUsers.map((user) => <SelectItem key={user.id} value={user.id}>{userName(user.id)}</SelectItem>)}</SelectContent></Select></div><div className="flex items-center gap-2 sm:col-span-2">{currentHr !== "none" && currentManager !== "none" ? <Badge variant="secondary">Fully aligned</Badge> : <Badge variant="outline">Needs alignment</Badge>}{saving === location.id && <Loader2 className="h-4 w-4 animate-spin" />}</div></div></div>})}</div>}
    </CardContent>
  </Card>
}

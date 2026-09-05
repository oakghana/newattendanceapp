"use client"

import { useMemo, useState, type FormEvent } from "react"
import { ArrowLeft, CalendarClock, CarFront, CircleAlert, Pencil, Plus, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"

type Vehicle = {
  id: string
  registration_number: string
  make: string
  model: string
  vehicle_type: string
  capacity: number
  assigned_location_id?: string | null
  assigned_location?: { name?: string | null } | null
  status: "available" | "assigned" | "maintenance" | "inactive"
  odometer_reading?: number | null
  insurance_expiry_date?: string | null
  roadworthy_expiry_date?: string | null
  notes?: string | null
}
type Booking = { id: string; vehicle_id: string; starts_at: string; ends_at: string; status: string }
type FleetLocation = { id: string; name: string }

const vehicleTypes = ["saloon", "bus", "truck", "pickup", "van", "motorcycle"]
const statusTone: Record<Vehicle["status"], "default" | "secondary" | "destructive" | "outline"> = { available: "default", assigned: "secondary", maintenance: "destructive", inactive: "outline" }

function VehicleFields({ vehicle, locations }: { vehicle?: Vehicle; locations: FleetLocation[] }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <div className="grid gap-2"><Label>Registration number</Label><Input name="registration_number" defaultValue={vehicle?.registration_number} required disabled={Boolean(vehicle)} /></div>
    <div className="grid gap-2"><Label>Vehicle type</Label><select name="vehicle_type" defaultValue={vehicle?.vehicle_type || "saloon"} className="h-10 rounded-md border bg-background px-3" required>{vehicleTypes.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></div>
    <div className="grid gap-2"><Label>Vehicle location</Label><select name="assigned_location_id" defaultValue={vehicle?.assigned_location_id || ""} className="h-10 rounded-md border bg-background px-3" required><option value="">Select location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></div>
    <div className="grid gap-2"><Label>Make</Label><Input name="make" defaultValue={vehicle?.make} required /></div>
    <div className="grid gap-2"><Label>Model</Label><Input name="model" defaultValue={vehicle?.model} required /></div>
    <div className="grid gap-2"><Label>Capacity</Label><Input name="capacity" type="number" min="1" defaultValue={vehicle?.capacity} required /></div>
    <div className="grid gap-2"><Label>Odometer reading</Label><Input name="odometer_reading" type="number" min="0" defaultValue={vehicle?.odometer_reading ?? ""} /></div>
    <div className="grid gap-2"><Label>Insurance expiry</Label><Input name="insurance_expiry_date" type="date" defaultValue={vehicle?.insurance_expiry_date ?? ""} /></div>
    <div className="grid gap-2"><Label>Roadworthy expiry</Label><Input name="roadworthy_expiry_date" type="date" defaultValue={vehicle?.roadworthy_expiry_date ?? ""} /></div>
  </div>
}

export function FleetInventoryWorkspace({ initialVehicles, initialBookings, locations, canEdit }: { initialVehicles: Vehicle[]; initialBookings: Booking[]; locations: FleetLocation[]; canEdit: boolean }) {
  const [vehicles, setVehicles] = useState(initialVehicles)
  const [bookings] = useState(initialBookings)
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const visibleVehicles = useMemo(() => vehicles.filter((vehicle) => `${vehicle.registration_number} ${vehicle.make} ${vehicle.model} ${vehicle.vehicle_type} ${vehicle.assigned_location?.name || ""}`.toLowerCase().includes(query.toLowerCase())), [vehicles, query])
  const today = new Date().toISOString().slice(0, 10)
  const expiring = vehicles.filter((vehicle) => [vehicle.insurance_expiry_date, vehicle.roadworthy_expiry_date].some((date) => date && date <= new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10))).length

  async function addVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true)
    const response = await fetch("/api/transport/vehicles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) })
    const body = await response.json().catch(() => null); setSaving(false)
    if (!response.ok) return toast({ title: "Unable to register vehicle", description: body?.error ?? "Please try again.", variant: "destructive" })
    setVehicles((current) => [...current, body.vehicle].sort((a, b) => a.registration_number.localeCompare(b.registration_number))); setAdding(false)
    toast({ title: "Vehicle registered", description: `${body.vehicle.registration_number} is available for assignment.` })
  }

  async function saveVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return; setSaving(true)
    const response = await fetch("/api/transport/vehicles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, status: editing.status, ...Object.fromEntries(new FormData(event.currentTarget)) }) })
    const body = await response.json().catch(() => null); setSaving(false)
    if (!response.ok) return toast({ title: "Unable to update vehicle", description: body?.error ?? "Please try again.", variant: "destructive" })
    setVehicles((current) => current.map((item) => item.id === editing.id ? body.vehicle : item)); setEditing(null)
    toast({ title: "Vehicle updated", description: `${body.vehicle.registration_number} details were saved.` })
  }

  async function changeStatus(vehicle: Vehicle, status: Vehicle["status"]) {
    setUpdatingId(vehicle.id)
    const response = await fetch("/api/transport/vehicles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: vehicle.id, status }) })
    const body = await response.json().catch(() => null); setUpdatingId(null)
    if (!response.ok) return toast({ title: "Unable to update vehicle", description: body?.error ?? "Please try again.", variant: "destructive" })
    setVehicles((current) => current.map((item) => item.id === vehicle.id ? body.vehicle : item))
  }

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><CarFront className="size-5" /></div><div><p className="text-sm font-medium text-primary">Transport operations</p><h1 className="text-3xl font-semibold tracking-tight">Fleet inventory</h1></div></div><p className="mt-3 text-sm leading-6 text-muted-foreground">Maintain vehicle availability, location, compliance dates, and current trip reservations.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><a href="/dashboard/transport"><ArrowLeft data-icon="inline-start" /> Back to transport</a></Button>{canEdit && <Button onClick={() => setAdding(true)}><Plus data-icon="inline-start" /> Register vehicle</Button>}</div></header>
    <div className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Vehicles in scope</p><p className="mt-1 text-3xl font-semibold">{vehicles.length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Available now</p><p className="mt-1 text-3xl font-semibold text-emerald-700">{vehicles.filter((vehicle) => vehicle.status === "available").length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Compliance due in 90 days</p><p className="mt-1 text-3xl font-semibold text-amber-700">{expiring}</p></CardContent></Card></div>
    <Card><CardHeader className="flex-row items-center justify-between gap-4"><CardTitle>Vehicle register</CardTitle><div className="relative w-full max-w-sm"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search registration, type, or location" /></div></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Vehicle</th><th className="p-3">Location</th><th className="p-3">Capacity</th><th className="p-3">Compliance</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{visibleVehicles.map((vehicle) => { const isDue = [vehicle.insurance_expiry_date, vehicle.roadworthy_expiry_date].some((date) => date && date <= today); const location = vehicle.assigned_location?.name || locations.find((item) => item.id === vehicle.assigned_location_id)?.name || "Not recorded"; return <tr key={vehicle.id} className="border-b last:border-0"><td className="p-3"><p className="font-medium">{vehicle.registration_number}</p><p className="text-xs text-muted-foreground">{vehicle.make} {vehicle.model} · {vehicle.vehicle_type}</p></td><td className="p-3">{location}</td><td className="p-3">{vehicle.capacity} seats</td><td className="p-3">{isDue ? <span className="inline-flex items-center gap-1 text-amber-700"><CircleAlert className="size-4" /> Review due</span> : <span className="text-muted-foreground">Insurance: {vehicle.insurance_expiry_date || "Not recorded"}</span>}</td><td className="p-3"><Badge variant={statusTone[vehicle.status]}>{vehicle.status}</Badge></td><td className="p-3"><div className="flex items-center gap-2"><select value={vehicle.status} disabled={updatingId === vehicle.id} onChange={(event) => void changeStatus(vehicle, event.target.value as Vehicle["status"])} className="h-9 rounded-md border bg-background px-2"><option value="available">Available</option><option value="assigned">Assigned</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select>{canEdit && <Button type="button" variant="outline" size="sm" onClick={() => setEditing(vehicle)}><Pencil data-icon="inline-start" /> Edit</Button>}</div></td></tr> })}</tbody></table></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-5" /> Current booking register</CardTitle></CardHeader><CardContent>{bookings.length ? <ul className="divide-y">{bookings.slice(0, 10).map((booking) => <li key={booking.id} className="flex items-center justify-between py-3 text-sm"><span>{vehicles.find((vehicle) => vehicle.id === booking.vehicle_id)?.registration_number ?? "Vehicle"}</span><span className="text-muted-foreground">{new Date(booking.starts_at).toLocaleString()} to {new Date(booking.ends_at).toLocaleString()}</span><Badge variant="secondary">{booking.status}</Badge></li>)}</ul> : <p className="py-4 text-sm text-muted-foreground">No active vehicle bookings have been recorded.</p>}</CardContent></Card>
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent><DialogHeader><DialogTitle>Register vehicle</DialogTitle></DialogHeader><form className="grid gap-4" onSubmit={addVehicle}><VehicleFields locations={locations} /><div className="grid gap-2"><Label>Notes</Label><Textarea name="notes" /></div><DialogFooter><Button type="submit" disabled={saving}>{saving ? "Registering..." : "Register vehicle"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>Edit vehicle</DialogTitle></DialogHeader>{editing && <form className="grid gap-4" onSubmit={saveVehicle}><VehicleFields vehicle={editing} locations={locations} /><div className="grid gap-2"><Label>Notes</Label><Textarea name="notes" defaultValue={editing.notes ?? ""} /></div><DialogFooter><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button></DialogFooter></form>}</DialogContent></Dialog>
  </div>
}

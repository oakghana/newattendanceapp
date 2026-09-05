"use client"

import { useMemo, useRef, useState } from "react"
import { ArrowLeft, FileText, Pencil, Search, ShieldCheck, TriangleAlert, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { canManageTransport } from "@/lib/role-capabilities"

type Driver = {
  id: string; full_name: string; license_number: string; license_type?: string | null; expiry_date: string
  status?: string | null; notes?: string | null; correction_note?: string | null; verification_status?: string
  license_document_url?: string | null; assigned_region_id?: string | null; production_year?: number | null; issuing_authority?: string | null; obtained_at?: string | null
}

export function DriverLicenseWorkspace({ initialDrivers, canVerify, role = "manager", assignedTasks = [] }: { initialDrivers: Driver[]; canVerify: boolean; role?: string; assignedTasks?: any[] }) {
  const canEdit = canManageTransport(role)
  const [drivers, setDrivers] = useState(initialDrivers)
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<Driver | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [licenseMeta, setLicenseMeta] = useState({ license_type: "", issuing_authority: "", obtained_at: "", production_year: "", expiry_year: "" })
  const fileInput = useRef<HTMLInputElement>(null)
  const visible = useMemo(() => drivers.filter((driver) => `${driver.full_name} ${driver.license_number} ${driver.license_type ?? ""}`.toLowerCase().includes(search.toLowerCase())), [drivers, search])
  const pending = drivers.filter((driver) => driver.verification_status !== "verified").length
  const expiring = drivers.filter((driver) => new Date(driver.expiry_date).getTime() < Date.now() + 90 * 86400000).length

  async function uploadLicense(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("folder", "driver-licenses")
      const upload = await fetch("/api/upload", { method: "POST", body: form })
      const result = await upload.json().catch(() => null)
      if (!upload.ok) throw new Error(result?.error ?? "Upload failed")
      const driverId = (initialDrivers[0] as Driver | undefined)?.id
      const save = await fetch("/api/transport/drivers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: driverId, license_document_url: result.url, ...licenseMeta, production_year: Number(licenseMeta.production_year), expiry_year: Number(licenseMeta.expiry_year) }) })
      if (!save.ok) throw new Error((await save.json().catch(() => null))?.error ?? "Unable to save license")
      const saved = await save.json().catch(() => null)
      if (saved?.driver) setDrivers([saved.driver])
      toast({ title: "License uploaded", description: "Your document is awaiting verification." })
    } catch (error) { toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }) }
    finally { setUploading(false) }
  }

  async function save(status: string) {
    if (!editing) return
    setSaving(true)
    const response = await fetch("/api/transport/drivers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editing, verification_status: status }) })
    const body = await response.json().catch(() => null)
    setSaving(false)
    if (!response.ok) { toast({ title: "Unable to save license", description: body?.error ?? "Please try again.", variant: "destructive" }); return }
    setDrivers((current) => current.map((driver) => driver.id === editing.id ? { ...editing, verification_status: status } : driver))
    setEditing(null)
    toast({ title: status === "verified" ? "License confirmed" : "Correction requested", description: "The driver record has been updated." })
  }

  if (role === "driver") return <div className="flex flex-col gap-6">
    <header className="flex flex-col gap-3 border-b pb-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck /></div><div><p className="text-sm font-medium text-primary">Driver workspace</p><h1 className="text-3xl font-semibold tracking-tight">Assigned transport tasks</h1><p className="text-muted-foreground leading-6">Your approved transport assignments, routes, meeting times, and departure details.</p></div></div><Button variant="outline" asChild><a href="/dashboard/transport"><ArrowLeft data-icon="inline-start" /> Back to transport</a></Button></div></header>
    <Card><CardHeader><CardTitle>My driving license</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-4"><div className="grid w-full gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label>License type</Label><Input required value={licenseMeta.license_type} onChange={(e) => setLicenseMeta({ ...licenseMeta, license_type: e.target.value })} placeholder="e.g. Class C" /></div><div className="grid gap-2"><Label>Issuing authority</Label><Input required value={licenseMeta.issuing_authority} onChange={(e) => setLicenseMeta({ ...licenseMeta, issuing_authority: e.target.value })} placeholder="e.g. DVLA" /></div><div className="grid gap-2"><Label>Where obtained</Label><Input required value={licenseMeta.obtained_at} onChange={(e) => setLicenseMeta({ ...licenseMeta, obtained_at: e.target.value })} placeholder="Town or office" /></div><div className="grid gap-2"><Label>Year of production</Label><Input required type="number" min="1900" max={new Date().getFullYear()} value={licenseMeta.production_year} onChange={(e) => setLicenseMeta({ ...licenseMeta, production_year: e.target.value })} /></div><div className="grid gap-2"><Label>Year of expiry</Label><Input required type="number" min={new Date().getFullYear()} value={licenseMeta.expiry_year} onChange={(e) => setLicenseMeta({ ...licenseMeta, expiry_year: e.target.value })} /></div></div><div><p className="font-medium">{drivers[0]?.license_document_url ? "Document uploaded" : "No document uploaded"}</p><p className="text-sm text-muted-foreground">Complete the license details before uploading the PDF, JPG, or PNG.</p></div><input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLicense(file); event.currentTarget.value = "" }} /><Button type="button" disabled={uploading} onClick={() => fileInput.current?.click()}><Upload className="mr-2 size-4" />{uploading ? "Uploading..." : drivers[0]?.license_document_url ? "Replace license" : "Upload license"}</Button>{drivers[0]?.license_document_url && <Button variant="outline" asChild><a href={drivers[0].license_document_url} target="_blank" rel="noreferrer"><FileText className="mr-2 size-4" />View document</a></Button>}</CardContent></Card>
    <Card><CardHeader><CardTitle>My assignments</CardTitle></CardHeader><CardContent className="grid gap-4">{assignedTasks.map((task) => <article key={task.id} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-muted-foreground">Route</p><p className="font-medium">{task.origin} to {task.destination}</p></div><div><p className="text-xs text-muted-foreground">Meet / depart</p><p className="font-medium">{task.required_at}</p></div><div><p className="text-xs text-muted-foreground">Vehicle</p><p className="font-medium">{task.assigned_vehicle || "To be confirmed"}</p></div><div><p className="text-xs text-muted-foreground">Passengers</p><p className="font-medium">{task.persons_requiring_transport}</p><p className="text-xs text-muted-foreground">{task.person_names || "Names not provided"}</p></div><div className="sm:col-span-2 lg:col-span-4"><p className="text-sm leading-6">{task.purpose}</p><Badge variant="secondary">{task.status}</Badge></div></article>)}{assignedTasks.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No transport assignments have been assigned to you yet.</p>}</CardContent></Card>
  </div>

  return <div className="flex flex-col gap-6">
    <header className="flex flex-col gap-3 border-b pb-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck /></div><div><h1 className="text-3xl font-semibold tracking-tight">Driver licenses</h1><p className="text-muted-foreground leading-6">Review license evidence and keep regional transport assignments compliant.</p></div></div><Button variant="outline" asChild><a href="/dashboard/transport"><ArrowLeft data-icon="inline-start" /> Back to transport</a></Button></div><p className="text-sm text-muted-foreground">Your results are limited to the locations and region assigned to your role.</p></header>
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Scoped drivers</p><p className="mt-1 text-2xl font-semibold">{drivers.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Awaiting verification</p><p className="mt-1 text-2xl font-semibold">{pending}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Expiring within 90 days</p><p className="mt-1 text-2xl font-semibold">{expiring}</p></CardContent></Card></div>
    <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><CardTitle>Regional driver register</CardTitle><div className="relative w-full max-w-sm"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search driver or license" value={search} onChange={(event) => setSearch(event.target.value)} /></div></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Driver</th><th className="p-3">License</th><th className="p-3">Expiry</th><th className="p-3">Verification</th><th className="p-3 text-right">Action</th></tr></thead><tbody>{visible.map((driver) => <tr key={driver.id} className="border-b last:border-0"><td className="p-3 font-medium">{driver.full_name}</td><td className="p-3">{driver.license_number}<span className="block text-xs text-muted-foreground">{driver.license_type ?? "Standard"}</span></td><td className="p-3">{new Date(driver.expiry_date).toLocaleDateString()}</td><td className="p-3"><Badge variant={driver.verification_status === "verified" ? "default" : "secondary"}>{(driver.verification_status ?? "pending").replaceAll("_", " ")}</Badge></td><td className="p-3 text-right"><div className="flex justify-end gap-2">{driver.license_document_url && <Button variant="outline" size="sm" asChild><a href={driver.license_document_url} target="_blank" rel="noreferrer"><FileText className="mr-1 size-4" /> Evidence</a></Button>}{canEdit && <Button size="sm" variant="outline" onClick={() => setEditing(driver)}><Pencil className="mr-1 size-4" /> Edit</Button>}</div></td></tr>)}</tbody></table>{visible.length === 0 && <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground"><TriangleAlert className="size-6" /><p>No driver licenses are available in your assigned scope.</p></div>}</CardContent></Card>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Review license details</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><div className="grid gap-2"><Label>Driver name</Label><Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></div><div className="grid gap-2"><Label>License number</Label><Input value={editing.license_number} onChange={(e) => setEditing({ ...editing, license_number: e.target.value })} /></div><div className="grid gap-2"><Label>Expiry date</Label><Input type="date" value={editing.expiry_date} onChange={(e) => setEditing({ ...editing, expiry_date: e.target.value })} /></div><div className="grid gap-2"><Label>License type</Label><Input value={editing.license_type ?? ""} onChange={(e) => setEditing({ ...editing, license_type: e.target.value })} /></div><div className="grid gap-2"><Label>Issuing authority</Label><Input value={editing.issuing_authority ?? ""} onChange={(e) => setEditing({ ...editing, issuing_authority: e.target.value })} /></div><div className="grid gap-2"><Label>Where obtained</Label><Input value={editing.obtained_at ?? ""} onChange={(e) => setEditing({ ...editing, obtained_at: e.target.value })} /></div><div className="grid gap-2"><Label>Year of production</Label><Input type="number" value={editing.production_year ?? ""} onChange={(e) => setEditing({ ...editing, production_year: Number(e.target.value) })} /></div><div className="grid gap-2"><Label>Review note</Label><Textarea value={editing.correction_note ?? editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, correction_note: e.target.value })} /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button variant="secondary" disabled={saving} onClick={() => save("needs_correction")}>Request correction</Button><Button disabled={saving} onClick={() => save("verified")}>Confirm accurate</Button></div></CardContent></Card></div>}
  </div>
}

export type { Driver }

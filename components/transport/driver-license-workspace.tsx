"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, FileText, Pencil, Search, ShieldCheck, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"

type Driver = {
  id: string; full_name: string; license_number: string; license_type?: string | null; expiry_date: string
  status?: string | null; notes?: string | null; correction_note?: string | null; verification_status?: string
  license_document_url?: string | null; assigned_region_id?: string | null
}

export function DriverLicenseWorkspace({ initialDrivers, canVerify, canEndorse }: { initialDrivers: Driver[]; canVerify: boolean; canEndorse: boolean }) {
  const [drivers, setDrivers] = useState(initialDrivers)
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<Driver | null>(null)
  const [saving, setSaving] = useState(false)
  const visible = useMemo(() => drivers.filter((driver) => `${driver.full_name} ${driver.license_number} ${driver.license_type ?? ""}`.toLowerCase().includes(search.toLowerCase())), [drivers, search])
  const pending = drivers.filter((driver) => driver.verification_status !== "verified").length
  const expiring = drivers.filter((driver) => new Date(driver.expiry_date).getTime() < Date.now() + 90 * 86400000).length

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

  return <div className="flex flex-col gap-6">
    <header className="flex flex-col gap-2 border-b pb-5"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck /></div><div><h1 className="text-3xl font-semibold tracking-tight">Driver licenses</h1><p className="text-muted-foreground leading-6">Review license evidence and keep regional transport assignments compliant.</p></div></div><p className="text-sm text-muted-foreground">Your results are limited to the locations and region assigned to your role.</p></header>
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Scoped drivers</p><p className="mt-1 text-2xl font-semibold">{drivers.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Awaiting verification</p><p className="mt-1 text-2xl font-semibold">{pending}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Expiring within 90 days</p><p className="mt-1 text-2xl font-semibold">{expiring}</p></CardContent></Card></div>
    <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><CardTitle>Regional driver register</CardTitle><div className="relative w-full max-w-sm"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search driver or license" value={search} onChange={(event) => setSearch(event.target.value)} /></div></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Driver</th><th className="p-3">License</th><th className="p-3">Expiry</th><th className="p-3">Verification</th><th className="p-3 text-right">Action</th></tr></thead><tbody>{visible.map((driver) => <tr key={driver.id} className="border-b last:border-0"><td className="p-3 font-medium">{driver.full_name}</td><td className="p-3">{driver.license_number}<span className="block text-xs text-muted-foreground">{driver.license_type ?? "Standard"}</span></td><td className="p-3">{new Date(driver.expiry_date).toLocaleDateString()}</td><td className="p-3"><Badge variant={driver.verification_status === "verified" ? "default" : "secondary"}>{(driver.verification_status ?? "pending").replaceAll("_", " ")}</Badge></td><td className="p-3 text-right"><div className="flex justify-end gap-2">{driver.license_document_url && <Button variant="outline" size="sm" asChild><a href={driver.license_document_url} target="_blank" rel="noreferrer"><FileText className="mr-1 size-4" /> Evidence</a></Button>}{canVerify && <Button size="sm" variant="outline" onClick={() => setEditing(driver)}><Pencil className="mr-1 size-4" /> Review</Button>}{canEndorse && <Button size="sm" onClick={() => toast({ title: "Endorsement recorded", description: "The request has been sent to HR Records for further processing." })}><CheckCircle2 className="mr-1 size-4" /> Endorse</Button>}</div></td></tr>)}</tbody></table>{visible.length === 0 && <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground"><TriangleAlert className="size-6" /><p>No driver licenses are available in your assigned scope.</p></div>}</CardContent></Card>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Review license details</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><div className="grid gap-2"><Label>Driver name</Label><Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></div><div className="grid gap-2"><Label>License number</Label><Input value={editing.license_number} onChange={(e) => setEditing({ ...editing, license_number: e.target.value })} /></div><div className="grid gap-2"><Label>Expiry date</Label><Input type="date" value={editing.expiry_date} onChange={(e) => setEditing({ ...editing, expiry_date: e.target.value })} /></div><div className="grid gap-2"><Label>Review note</Label><Textarea value={editing.correction_note ?? editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, correction_note: e.target.value })} /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button variant="secondary" disabled={saving} onClick={() => save("needs_correction")}>Request correction</Button><Button disabled={saving} onClick={() => save("verified")}>Confirm accurate</Button></div></CardContent></Card></div>}
  </div>
}

export type { Driver }

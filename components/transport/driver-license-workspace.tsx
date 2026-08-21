"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Driver = { id: string; full_name: string; license_number: string; license_type?: string | null; expiry_date: string; notes?: string | null; verification_status?: string }

export function DriverLicenseWorkspace({ initialDrivers, canVerify }: { initialDrivers: Driver[]; canVerify: boolean }) {
  const [drivers, setDrivers] = useState(initialDrivers)
  const [saving, setSaving] = useState<string | null>(null)
  async function update(driver: Driver, status: "verified" | "needs_correction") {
    setSaving(driver.id)
    const response = await fetch("/api/transport/drivers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...driver, verification_status: status }) })
    if (response.ok) setDrivers((items) => items.map((item) => item.id === driver.id ? { ...item, verification_status: status } : item))
    setSaving(null)
  }
  return <div className="space-y-6"><div><h1 className="text-3xl font-semibold">Driver licenses</h1><p className="text-muted-foreground leading-6">Review submitted license details and confirm accuracy before assigning drivers.</p></div><div className="grid gap-4 md:grid-cols-2">{drivers.map((driver) => <Card key={driver.id}><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">{driver.full_name}</CardTitle><Badge variant={driver.verification_status === "verified" ? "default" : "secondary"}>{driver.verification_status ?? "pending"}</Badge></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><div><Label>License number</Label><Input defaultValue={driver.license_number} readOnly={!canVerify} /></div><div><Label>Expiry date</Label><Input type="date" defaultValue={driver.expiry_date} readOnly={!canVerify} /></div></div><p className="text-sm text-muted-foreground">Type: {driver.license_type || "Not provided"}</p>{canVerify && <div className="flex gap-2"><Button disabled={saving === driver.id} onClick={() => update(driver, "verified")}>Confirm details accurate</Button><Button variant="outline" disabled={saving === driver.id} onClick={() => update(driver, "needs_correction")}>Request correction</Button></div>}</CardContent></Card>)}</div>{drivers.length === 0 && <Card><CardContent className="py-10 text-center text-muted-foreground">No driver license submissions yet.</CardContent></Card>}</div>
}

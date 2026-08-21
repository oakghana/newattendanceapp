import { redirect } from "next/navigation"
import { ArrowLeft, Bus, CalendarDays, MapPin, Users } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"

const roles = new Set(["admin", "administrator", "it_admin", "driver", "regional_hr", "regional_hr_office", "regional_hr_officer", "regional_manager", "hr_records", "hr_records_officer", "hr_records_manager", "managing_director", "director_hr", "manager_hr"])
const normalize = (value: string) => value.toLowerCase().trim().replace(/[\s-]+/g, "_")
const label = (value: string | null) => (value ?? "submitted").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())

export default async function TransportRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
  if (!profile || !roles.has(normalize(profile.role ?? ""))) redirect("/dashboard")

  const { data: requests } = await supabase.from("transport_requests").select("id, purpose, origin, destination, event_date, passenger_count, status, workflow_stage, reference_number, created_at").order("created_at", { ascending: false }).limit(200)
  const rows = requests ?? []

  return <main className="flex flex-col gap-6">
    <header className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
      <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bus /></div><div><p className="text-sm text-muted-foreground">Transport Management</p><h1 className="text-3xl font-semibold tracking-tight">Transport request register</h1><p className="text-muted-foreground leading-6">View every submitted request, its current status, and where it is in the approval process.</p></div></div>
      <Button asChild><Link href="/dashboard/transport"><ArrowLeft data-icon="inline-start" /> Back to transport</Link></Button>
    </header>
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">All requests</p><p className="text-2xl font-semibold">{rows.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Awaiting review</p><p className="text-2xl font-semibold">{rows.filter((row) => !["approved", "rejected", "completed", "closed"].includes(row.status ?? "")).length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Approved</p><p className="text-2xl font-semibold">{rows.filter((row) => row.status === "approved").length}</p></CardContent></Card></div>
    <Card><CardHeader><CardTitle>Submitted requests</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-y bg-muted/30 text-left text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Request</th><th className="px-5 py-3 font-medium">Journey</th><th className="px-5 py-3 font-medium">Event date</th><th className="px-5 py-3 font-medium">Passengers</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Stage</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="px-5 py-4"><p className="font-medium">{row.reference_number ?? `Request ${row.id.slice(0, 8)}`}</p><p className="text-muted-foreground">{row.purpose}</p></td><td className="px-5 py-4"><div className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" />{row.origin} <span className="text-muted-foreground">to</span> {row.destination}</div></td><td className="px-5 py-4"><div className="flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" />{row.event_date ? new Date(row.event_date).toLocaleDateString() : "—"}</div></td><td className="px-5 py-4"><div className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" />{row.passenger_count}</div></td><td className="px-5 py-4"><Badge variant={row.status === "rejected" ? "destructive" : row.status === "approved" ? "default" : "secondary"}>{label(row.status)}</Badge></td><td className="px-5 py-4 text-muted-foreground">{label(row.workflow_stage)}</td></tr>)}</tbody></table>{rows.length === 0 && <div className="p-10 text-center text-muted-foreground">No transport requests have been submitted yet.</div>}</div></CardContent></Card>
  </main>
}

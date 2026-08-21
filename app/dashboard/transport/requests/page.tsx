import { redirect } from "next/navigation"
import { ArrowLeft, Bus, Plus } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { TransportRequestRegister } from "@/components/transport/transport-request-register"
import { createClient } from "@/lib/supabase/server"
import { isRegionalHrRole, isRegionalManagerRole } from "@/lib/role-capabilities"

const roles = new Set(["admin", "administrator", "it_admin", "driver", "regional_hr", "regional_hr_office", "regional_hr_officer", "regional_manager", "hr_records", "hr_records_officer", "hr_records_manager", "managing_director", "director_hr", "manager_hr"])
const normalize = (value: string) => value.toLowerCase().trim().replace(/[\s-]+/g, "_")

export default async function TransportRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase.from("user_profiles").select("role, region_id, district_id").eq("id", user.id).single()
  if (!profile || !roles.has(normalize(profile.role ?? ""))) redirect("/dashboard")
  const canCreate = isRegionalHrRole(profile.role)
  const canAct = isRegionalManagerRole(profile.role)
  let requestsQuery = supabase.from("transport_requests").select("id, purpose, origin, destination, event_date, passenger_count, status, workflow_stage, reference_number, supporting_documents, created_at, assigned_region_id, assigned_district_id").order("created_at", { ascending: false }).limit(200)
  if (isRegionalManagerRole(profile.role)) {
    if (profile.region_id) requestsQuery = requestsQuery.eq("assigned_region_id", profile.region_id)
    if (profile.district_id) requestsQuery = requestsQuery.eq("assigned_district_id", profile.district_id)
  }
  const { data: requests } = await requestsQuery

  return <main className="flex flex-col gap-6">
    <header className="flex flex-col gap-5 border-b pb-6 md:flex-row md:items-end md:justify-between"><div className="flex items-start gap-3"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bus /></div><div><p className="text-sm font-medium text-primary">Transport Management</p><h1 className="text-3xl font-semibold tracking-tight text-balance">Transport request register</h1><p className="mt-1 max-w-2xl text-muted-foreground leading-6">Track every request from submission through Regional HR review, approval, and fulfilment.</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/dashboard/transport"><ArrowLeft data-icon="inline-start" /> Back to transport</Link></Button>{canCreate && <Button asChild><Link href="/dashboard/transport"><Plus data-icon="inline-start" /> New transport request</Link></Button>}</div></header>
    <TransportRequestRegister rows={requests ?? []} canCreate={canCreate} canAct={canAct} />
  </main>
}

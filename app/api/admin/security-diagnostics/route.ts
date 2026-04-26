import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { parseRuntimeFlags } from "@/lib/runtime-flags"

export const dynamic = "force-dynamic"

interface TableHealth {
  name: string
  label: string
  status: "ok" | "missing" | "policy_error" | "error"
  rowCount: number | null
  recentCount: number | null
  error: string | null
}

async function probeTable(
  adminClient: Awaited<ReturnType<typeof createAdminClient>>,
  tableName: string,
  label: string,
  recentDays = 7
): Promise<TableHealth> {
  try {
    // Total row count
    const { count: total, error: totalErr } = await adminClient
      .from(tableName)
      .select("*", { count: "exact", head: true })

    if (totalErr) {
      const isPolicy = totalErr.code === "42501" || totalErr.message?.includes("permission")
      return {
        name: tableName,
        label,
        status: isPolicy ? "policy_error" : "missing",
        rowCount: null,
        recentCount: null,
        error: totalErr.message,
      }
    }

    // Recent (last N days) – only meaningful for violations/sessions
    const cutoff = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000).toISOString()
    const { count: recent, error: recentErr } = await adminClient
      .from(tableName)
      .select("*", { count: "exact", head: true })
      .gte("created_at", cutoff)

    return {
      name: tableName,
      label,
      status: "ok",
      rowCount: total ?? 0,
      recentCount: recentErr ? null : (recent ?? 0),
      error: null,
    }
  } catch (err) {
    return {
      name: tableName,
      label,
      status: "error",
      rowCount: null,
      recentCount: null,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

export async function GET() {
  try {
    // Auth check – admin only
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "it-admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const adminClient = await createAdminClient()

  const { data: systemSettings } = await supabase.from("system_settings").select("settings").maybeSingle()
  const { deviceSharingEnforcementEnabled } = parseRuntimeFlags(systemSettings?.settings)

    const [bindings, violations, sessions] = await Promise.all([
      probeTable(adminClient, "device_user_bindings", "Device Bindings"),
      probeTable(adminClient, "device_security_violations", "Security Violations"),
      probeTable(adminClient, "device_sessions", "Device Sessions"),
    ])

    const tables = [bindings, violations, sessions]
    const allOk = tables.every((t) => t.status === "ok")
    const anyMissing = tables.some((t) => t.status === "missing" || t.status === "error")

    return NextResponse.json({
      overall: allOk ? "healthy" : anyMissing ? "degraded" : "warning",
      tables,
      checkedAt: new Date().toISOString(),
      enforcementEnabled: deviceSharingEnforcementEnabled,
    })
  } catch (err) {
    console.error("[security-diagnostics] Unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

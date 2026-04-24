import { createClient } from "@/lib/supabase/server"
import { DEFAULT_RUNTIME_FLAGS, parseRuntimeFlags } from "@/lib/runtime-flags"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: systemSettings } = await supabase.from("system_settings").select("settings").maybeSingle()
    const flags = parseRuntimeFlags(systemSettings?.settings)

    return NextResponse.json({
      flags,
      defaults: DEFAULT_RUNTIME_FLAGS,
    })
  } catch (error) {
    console.error("[v0] Runtime settings GET error:", error)
    return NextResponse.json({ error: "Failed to load runtime settings" }, { status: 500 })
  }
}

import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user profile to check role
    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Access denied. Admin role required." }, { status: 403 })
    }

    const [{ data: userSettings }, { data: systemSettings }] = await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      profile?.role === "admin"
        ? supabase.from("system_settings").select("*").maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    return NextResponse.json(
      {
        userSettings,
        systemSettings,
        isAdmin: profile?.role === "admin",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate, private",
          Pragma: "no-cache",
          Expires: "0",
          "X-Content-Type-Options": "nosniff",
        },
      },
    )
  } catch (error) {
    console.error("[v0] Settings GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { userSettings, systemSettings } = body

    // Get user profile to check role
    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Access denied. Admin role required." }, { status: 403 })
    }

    // Update user settings
    if (userSettings) {
      const { error: userSettingsError } = await supabase.from("user_settings").upsert(
        {
          user_id: user.id,
          app_settings: userSettings.app_settings || {},
          notification_settings: userSettings.notification_settings || {},
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id", // Specify conflict resolution column
        },
      )

      if (userSettingsError) {
        console.error("[v0] User settings update error:", userSettingsError)
        throw userSettingsError
      }

      const { error: auditLogError } = await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "update_user_settings",
        details: { updated_fields: Object.keys(userSettings) },
        ip_address: request.headers.get("x-forwarded-for") || null,
        user_agent: request.headers.get("user-agent") || "unknown",
      });

      if (auditLogError) {
        console.error("[v0] Audit log insertion error:", auditLogError);
      }
    }

    // Update system settings if admin
    if (systemSettings && profile?.role === "admin") {
      if (systemSettings.geo_settings?.browserTolerances) {
        const tolerances = systemSettings.geo_settings.browserTolerances
        const validatedTolerances: any = {}

        for (const [browser, distance] of Object.entries(tolerances)) {
          validatedTolerances[browser] = Math.max(50, Math.min(5000, Number(distance)))
        }

        systemSettings.geo_settings.browserTolerances = validatedTolerances
      }

      if (systemSettings.geo_settings?.checkInProximityRange) {
        const validatedProximity = Math.max(
          50,
          Math.min(2000, Number.parseInt(systemSettings.geo_settings.checkInProximityRange)),
        )
        systemSettings.geo_settings.checkInProximityRange = validatedProximity.toString()
        systemSettings.geo_settings.globalProximityDistance = validatedProximity.toString()
      }

      if (systemSettings.geo_settings?.defaultRadius) {
        const validatedRadius = Math.max(20, Number.parseInt(systemSettings.geo_settings.defaultRadius))
        systemSettings.geo_settings.defaultRadius = validatedRadius.toString()
      }

      const { error: systemSettingsError } = await supabase.from("system_settings").upsert({
        id: 1,
        settings: systemSettings.settings || {},
        geo_settings: systemSettings.geo_settings || {},
        updated_at: new Date().toISOString(),
      })

      if (systemSettingsError) {
        console.error("[v0] System settings update error:", systemSettingsError)
        throw systemSettingsError
      }

      const { error: auditLogError } = await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "update_system_settings",
        details: {
          updated_fields: Object.keys(systemSettings),
          browser_tolerances: systemSettings.geo_settings?.browserTolerances,
          browser_specific_enabled: systemSettings.geo_settings?.enableBrowserSpecificTolerance,
          message: "System settings updated including browser-specific GPS tolerances",
        },
        ip_address: request.headers.get("x-forwarded-for") || null,
        user_agent: request.headers.get("user-agent") || "unknown",
      });

      if (auditLogError) {
        console.error("[v0] Audit log insertion error:", auditLogError);
      }
    }

    return NextResponse.json(
      { success: true, message: "Settings updated successfully" },
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate, private",
          Pragma: "no-cache",
          Expires: "0",
          "X-Content-Type-Options": "nosniff",
        },
      },
    )
  } catch (error) {
    console.error("[v0] Settings PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update settings" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    )
  }
}

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: staff, error } = await supabase
      .from("user_profiles")
      .select(`
        id,
        first_name,
        last_name,
        email,
        phone,
        employee_id,
        position,
        is_active,
        created_at,
        departments(name)
      `)
      .eq("role", "staff")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Staff fetch error:", error)
      return NextResponse.json({ error: "Failed to fetch staff" }, { status: 500 })
    }

    const formattedStaff =
      (staff as Array<any> | null)?.map((s) => ({
        ...s,
        department_name: Array.isArray(s.departments) ? s.departments[0]?.name || null : s.departments?.name || null,
      })) || []

    return NextResponse.json({ staff: formattedStaff })
  } catch (error) {
    console.error("Staff activation API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId, activate } = await request.json()
    const supabase = await createClient()

    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({
        is_active: activate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)

    if (updateError) {
      console.error("Staff activation error:", updateError)
      return NextResponse.json({ error: "Failed to update staff status" }, { status: 500 })
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      user_id: userId,
      action: activate ? "staff_activated" : "staff_deactivated",
      table_name: "user_profiles",
      record_id: userId,
      new_values: { is_active: activate },
      created_at: new Date().toISOString(),
    })

    if (auditError) {
      console.error("Audit log error:", auditError)
    }

    return NextResponse.json({
      message: `Staff ${activate ? "activated" : "deactivated"} successfully`,
    })
  } catch (error) {
    console.error("Staff activation PATCH error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Fetch all leave deferment requests
    const { data: deferments, error } = await admin
      .from("leave_deferment_requests")
      .select(`
        id,
        leave_plan_request_id,
        requested_deferment_year,
        status,
        leave_plan_requests(
          user_id,
          leave_type_key,
          user_profiles(first_name, last_name)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      console.error("[v0] Error fetching deferments:", error)
      return NextResponse.json({ deferments: [], error: error.message }, { status: 200 })
    }

    const normalized = (deferments || []).map((d: any) => {
      const req = d.leave_plan_requests
      return {
        id: String(d.id),
        employee_name: `${req?.user_profiles?.first_name || ""} ${req?.user_profiles?.last_name || ""}`.trim() || "Staff",
        leave_type: String(req?.leave_type_key || "").replace(/_/g, " ").toUpperCase(),
        deferral_year: String(d.requested_deferment_year || ""),
        status: String(d.status || "pending").toUpperCase(),
      }
    })

    return NextResponse.json({ deferments: normalized })
  } catch (err) {
    console.error("[v0] Deferments API error:", err)
    return NextResponse.json({ deferments: [], error: "Internal server error" }, { status: 200 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const body = await request.json()
    const { deferment_id, status, hr_decision, hr_decision_note } = body

    if (!deferment_id || !status) {
      return NextResponse.json({ error: "Missing deferment_id or status" }, { status: 400 })
    }

    // Update deferment status
    const { data, error } = await admin
      .from("leave_deferment_requests")
      .update({
        status,
        hr_decision: hr_decision || null,
        hr_decision_note: hr_decision_note || null,
        hr_office_reviewed_at: new Date().toISOString(),
      })
      .eq("id", deferment_id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error updating deferment:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, message: "Deferment updated successfully" })
  } catch (err) {
    console.error("[v0] Deferment POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const deferment_id = searchParams.get("id")

    if (!deferment_id) {
      return NextResponse.json({ error: "Missing deferment id" }, { status: 400 })
    }

    const { error } = await admin
      .from("leave_deferment_requests")
      .delete()
      .eq("id", deferment_id)

    if (error) {
      console.error("[v0] Error deleting deferment:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Deferment deleted successfully" })
  } catch (err) {
    console.error("[v0] Deferment DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

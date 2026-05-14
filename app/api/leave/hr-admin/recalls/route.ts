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

    // Fetch all leave recall requests
    const { data: recalls, error } = await admin
      .from("leave_recall_requests")
      .select(`
        id,
        leave_plan_request_id,
        recall_date,
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
      console.error("[v0] Error fetching recalls:", error)
      return NextResponse.json({ recalls: [], error: error.message }, { status: 200 })
    }

    const normalized = (recalls || []).map((r: any) => {
      const req = r.leave_plan_requests
      return {
        id: String(r.id),
        employee_name: `${req?.user_profiles?.first_name || ""} ${req?.user_profiles?.last_name || ""}`.trim() || "Staff",
        leave_type: String(req?.leave_type_key || "").replace(/_/g, " ").toUpperCase(),
        recall_date: String(r.recall_date || ""),
        status: String(r.status || "pending").toUpperCase(),
      }
    })

    return NextResponse.json({ recalls: normalized })
  } catch (err) {
    console.error("[v0] Recalls API error:", err)
    return NextResponse.json({ recalls: [], error: "Internal server error" }, { status: 200 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const body = await request.json()
    const { recall_id, status, hr_decision, hr_decision_note } = body

    if (!recall_id || !status) {
      return NextResponse.json({ error: "Missing recall_id or status" }, { status: 400 })
    }

    // Update recall status
    const { data, error } = await admin
      .from("leave_recall_requests")
      .update({
        status,
        hr_decision: hr_decision || null,
        hr_decision_note: hr_decision_note || null,
        hr_reviewed_at: new Date().toISOString(),
      })
      .eq("id", recall_id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error updating recall:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, message: "Recall updated successfully" })
  } catch (err) {
    console.error("[v0] Recall POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const recall_id = searchParams.get("id")

    if (!recall_id) {
      return NextResponse.json({ error: "Missing recall id" }, { status: 400 })
    }

    const { error } = await admin
      .from("leave_recall_requests")
      .delete()
      .eq("id", recall_id)

    if (error) {
      console.error("[v0] Error deleting recall:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Recall deleted successfully" })
  } catch (err) {
    console.error("[v0] Recall DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const status = searchParams.get("status")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    // Include user_profiles relationship for name, department, etc.
    let query = supabase.from("leave_requests").select(`
      *,
      user_profiles:user_id (
        first_name,
        last_name,
        employee_id,
        department_id,
        departments:department_id (name)
      )
    `, { count: "exact" })

    if (userId) query = query.eq("user_id", userId)
    if (status) query = query.eq("status", status)

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return NextResponse.json({ data, total: count, success: true })
  } catch (error) {
    console.error("[v0] Error fetching leave requests:", error)
    return NextResponse.json({ error: "Failed to fetch requests", success: false }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()

    // Generate a reference number
    const refNumber = `LR-${Date.now().toString(36).toUpperCase()}`

    const { data, error } = await supabase.from("leave_requests").insert([
      {
        user_id: body.userId,
        start_date: body.startDate,
        end_date: body.endDate,
        reason: body.reason || `${body.leaveType || "Annual"} Leave Request`,
        status: "pending",
        reference_number: refNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]).select()

    if (error) throw error

    // Return with leave_type added to the response
    const result = data[0] ? { ...data[0], leave_type: body.leaveType || "Annual Leave" } : null

    return NextResponse.json({ data: result, success: true }, { status: 201 })
  } catch (error) {
    console.error("[v0] Error creating leave request:", error)
    return NextResponse.json({ error: "Failed to create request", success: false }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()

    const { data, error } = await supabase
      .from("leave_requests")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .select()

    if (error) throw error

    return NextResponse.json({ data: data[0], success: true })
  } catch (error) {
    console.error("[v0] Error updating leave request:", error)
    return NextResponse.json({ error: "Failed to update request", success: false }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    const { error } = await supabase.from("leave_requests").delete().eq("id", id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error deleting leave request:", error)
    return NextResponse.json({ error: "Failed to delete request", success: false }, { status: 500 })
  }
}

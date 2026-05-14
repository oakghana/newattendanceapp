import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from("user_profiles")
      .select(`
        id,
        employee_id,
        first_name,
        last_name,
        department_id,
        departments (name)
      `)
      .eq("is_active", true)
      .order("first_name", { ascending: true })
      .limit(500)

    if (error) throw error

    const staff = (data || []).map((s: any) => ({
      id: s.id,
      employee_id: s.employee_id || "N/A",
      first_name: s.first_name || "",
      last_name: s.last_name || "",
      department_name: s.departments?.name || "Unassigned",
    }))

    return NextResponse.json({ staff, success: true })
  } catch (error) {
    console.error("[v0] Error fetching staff list:", error)
    return NextResponse.json({ error: "Failed to fetch staff", success: false }, { status: 500 })
  }
}

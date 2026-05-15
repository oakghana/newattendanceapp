import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface OutstandingBalance {
  id: string
  user_id: string
  leave_year_period: string
  opening_balance: number
  entitlement_days: number
  used_this_period: number
  carryover_to_next_year: number
  max_carryover_allowed: number
  notes: string | null
  created_at: string
  updated_at: string
  // Joined from user_profiles
  staff_name?: string
  employee_id?: string
  department_name?: string
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const leaveYearPeriod = searchParams.get("leaveYearPeriod")
    const userId = searchParams.get("userId")

    // Fetch outstanding leave balances with user profile info
    let query = supabase
      .from("outstanding_leave_balances")
      .select(`
        *,
        user_profiles!outstanding_leave_balances_user_id_fkey (
          first_name,
          last_name,
          employee_id,
          departments (name)
        )
      `)
      .order("created_at", { ascending: false })

    if (leaveYearPeriod) {
      query = query.eq("leave_year_period", leaveYearPeriod)
    }
    
    // Filter by specific user if provided
    if (userId) {
      query = query.eq("user_id", userId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching outstanding balances with join:", error)
      // Try simpler query without join and then manually fetch user profiles
      let simpleQuery = supabase
        .from("outstanding_leave_balances")
        .select("*")
        .order("created_at", { ascending: false })
      
      if (leaveYearPeriod) {
        simpleQuery = simpleQuery.eq("leave_year_period", leaveYearPeriod)
      }
      if (userId) {
        simpleQuery = simpleQuery.eq("user_id", userId)
      }
      
      const { data: simpleData, error: simpleError } = await simpleQuery

      if (simpleError) throw simpleError
      
      // Fetch user profiles separately for each record
      const userIds = [...new Set((simpleData || []).map((d: any) => d.user_id).filter(Boolean))]
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, department_id, departments(name)")
        .in("id", userIds)
      
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]))
      
      const transformedSimple = (simpleData || []).map((item: any) => {
        const profile = profileMap.get(item.user_id)
        return {
          ...item,
          staff_name: profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown" : "Unknown",
          employee_id: profile?.employee_id || "N/A",
          department_name: profile?.departments?.name || "Unassigned",
        }
      })
      
      return NextResponse.json({ data: transformedSimple, success: true })
    }

    console.log("[v0] Outstanding balances raw data sample:", data?.[0])
    
    // Transform data to include staff names
    const transformedData = (data || []).map((item: any) => ({
      ...item,
      staff_name: item.user_profiles 
        ? `${item.user_profiles.first_name || ""} ${item.user_profiles.last_name || ""}`.trim() || "Unknown"
        : "Unknown",
      employee_id: item.user_profiles?.employee_id || "N/A",
      department_name: item.user_profiles?.departments?.name || "Unassigned",
    }))

    return NextResponse.json({ data: transformedData, success: true })
  } catch (error) {
    console.error("[v0] Error fetching outstanding balances:", error)
    return NextResponse.json({ error: "Failed to fetch outstanding balances", success: false }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()

    const {
      user_id,
      leave_year_period,
      opening_balance,
      entitlement_days,
      used_this_period,
      carryover_to_next_year,
      max_carryover_allowed,
      notes,
    } = body

    if (!user_id || !leave_year_period) {
      return NextResponse.json(
        { error: "user_id and leave_year_period are required", success: false },
        { status: 400 }
      )
    }

    // Check if record already exists
    const { data: existing } = await supabase
      .from("outstanding_leave_balances")
      .select("id")
      .eq("user_id", user_id)
      .eq("leave_year_period", leave_year_period)
      .single()

    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        .from("outstanding_leave_balances")
        .update({
          opening_balance: opening_balance ?? 0,
          entitlement_days: entitlement_days ?? 0,
          used_this_period: used_this_period ?? 0,
          carryover_to_next_year: carryover_to_next_year ?? 0,
          max_carryover_allowed: max_carryover_allowed ?? 5,
          notes: notes ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ data, success: true, updated: true })
    }

    // Insert new record
    const { data, error } = await supabase
      .from("outstanding_leave_balances")
      .insert({
        user_id,
        leave_year_period,
        opening_balance: opening_balance ?? 0,
        entitlement_days: entitlement_days ?? 0,
        used_this_period: used_this_period ?? 0,
        carryover_to_next_year: carryover_to_next_year ?? 0,
        max_carryover_allowed: max_carryover_allowed ?? 5,
        notes: notes ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data, success: true, created: true })
  } catch (error) {
    console.error("[v0] Error saving outstanding balance:", error)
    return NextResponse.json({ error: "Failed to save outstanding balance", success: false }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: "id is required", success: false }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("outstanding_leave_balances")
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data, success: true })
  } catch (error) {
    console.error("[v0] Error updating outstanding balance:", error)
    return NextResponse.json({ error: "Failed to update outstanding balance", success: false }, { status: 500 })
  }
}

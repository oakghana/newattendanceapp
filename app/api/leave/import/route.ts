import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

interface ImportedLeaveRow {
  staffNumber: string
  staffName: string
  leaveType: string
  startDate: string
  endDate: string
  days: number
  reason: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = String((profile as any).role || "").toLowerCase().trim()
    const isAuthorized = ["admin", "hr", "leave_admin", "hr_officer"].includes(role)

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Only HR staff can import leave requests" },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.split("\n").filter((line) => line.trim())

    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 })
    }

    // Parse CSV (simple parser - skip headers)
    const rows: ImportedLeaveRow[] = []
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""))

      const staffNumberIdx = headers.indexOf("staff number")
      const staffNameIdx = headers.indexOf("staff name")
      const leaveTypeIdx = headers.indexOf("leave type")
      const startDateIdx = headers.indexOf("start date") || headers.indexOf("requested start date")
      const endDateIdx = headers.indexOf("end date") || headers.indexOf("requested end date")
      const daysIdx = headers.indexOf("days") || headers.indexOf("requested days")
      const reasonIdx = headers.indexOf("reason")

      if (
        staffNumberIdx === -1 ||
        staffNameIdx === -1 ||
        leaveTypeIdx === -1 ||
        startDateIdx === -1 ||
        endDateIdx === -1
      ) {
        continue // Skip row if required columns missing
      }

      rows.push({
        staffNumber: values[staffNumberIdx] || "",
        staffName: values[staffNameIdx] || "",
        leaveType: values[leaveTypeIdx] || "",
        startDate: values[startDateIdx] || "",
        endDate: values[endDateIdx] || "",
        days: Number(values[daysIdx]) || 0,
        reason: values[reasonIdx] || "",
      })
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid leave records found in CSV" },
        { status: 400 }
      )
    }

    // Validate and create leave requests
    const created = []
    const errors = []

    for (const row of rows) {
      try {
        // Find user by employee_id or staff number
        const { data: userProfile, error: userError } = await admin
          .from("user_profiles")
          .select("id")
          .eq("employee_id", row.staffNumber)
          .single()

        if (userError || !userProfile) {
          errors.push(`Row: ${row.staffName} - Staff not found (${row.staffNumber})`)
          continue
        }

        // Validate dates
        const startDate = new Date(row.startDate)
        const endDate = new Date(row.endDate)

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate < startDate) {
          errors.push(`Row: ${row.staffName} - Invalid date range`)
          continue
        }

        // Create leave request with "pending_import_review" status
        const { error: createError } = await admin.from("leave_plan_requests").insert({
          user_id: userProfile.id,
          leave_type_key: row.leaveType.toLowerCase(),
          preferred_start_date: row.startDate,
          preferred_end_date: row.endDate,
          requested_days: row.days,
          reason: row.reason,
          status: "pending_hod_review", // Start with HOD review
          created_at: new Date().toISOString(),
        })

        if (createError) {
          errors.push(`Row: ${row.staffName} - ${createError.message}`)
        } else {
          created.push(`${row.staffName} - ${row.leaveType}`)
        }
      } catch (err) {
        errors.push(`Row: ${row.staffName} - Error: ${String(err)}`)
      }
    }

    console.log("[v0] Leave import completed. Created:", created.length, "Errors:", errors.length)

    return NextResponse.json({
      created: created.length,
      errors: errors.length,
      createdRecords: created,
      errorRecords: errors,
    })
  } catch (err) {
    console.error("[v0] Error importing leaves:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

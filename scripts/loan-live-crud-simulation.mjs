import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import path from "node:path"

function loadEnvFromLocalFile() {
  const envPath = path.resolve(process.cwd(), ".env.local")
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message)
}

function roleIsOneOf(profile, roles) {
  const role = String(profile?.role || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
  return roles.includes(role)
}

async function run() {
  loadEnvFromLocalFile()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  assertOk(url, "NEXT_PUBLIC_SUPABASE_URL is missing")
  assertOk(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is missing")

  const supabase = createClient(url, serviceRoleKey)

  const runId = `LIVE-SIM-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`
  const createdRequestIds = []

  try {
    console.log(`[SIM] Run ID: ${runId}`)

    const { data: users, error: usersError } = await supabase
      .from("user_profiles")
      .select("id, role, first_name, last_name, position, employee_id, department_id, is_active")
      .limit(500)

    if (usersError) throw usersError
    assertOk((users || []).length > 0, "No active users found")

    const pick = (roles, fallback = null) => {
      const found = (users || []).find((u) => roleIsOneOf(u, roles))
      return found || fallback
    }

    const admin = pick(["admin", "it_admin", "super_admin"])
    assertOk(admin, "No admin user found")

    const staff = pick(["staff", "nsp", "intern", "contract"], admin)
    const hod = pick(["department_head", "regional_manager"], admin)
    const loanOffice = pick(["loan_officer"], admin)
    const accounts = pick(["accounts"], admin)
    const committee = pick(["loan_committee", "committee_member"], admin)
    const hr = pick(["hr_officer"], admin)
    const director = pick(["director_hr", "hr_director"], admin)

    console.log("[SIM] Actors selected:")
    console.log(`  Staff: ${staff.id} (${staff.role})`)
    console.log(`  HOD: ${hod.id} (${hod.role})`)
    console.log(`  Loan Office: ${loanOffice.id} (${loanOffice.role})`)
    console.log(`  Accounts: ${accounts.id} (${accounts.role})`)
    console.log(`  Committee: ${committee.id} (${committee.role})`)
    console.log(`  HR: ${hr.id} (${hr.role})`)
    console.log(`  Director: ${director.id} (${director.role})`)

    const { data: loanType, error: loanTypeError } = await supabase
      .from("loan_types")
      .select("loan_key, loan_label, fixed_amount")
      .eq("loan_key", "car_loan_senior")
      .maybeSingle()

    if (loanTypeError) throw loanTypeError
    assertOk(loanType, "Loan type car_loan_senior not found")

    const nowIso = new Date().toISOString()
    const requestNumber = `${runId}-001`

    const { data: createdRows, error: createError } = await supabase
      .from("loan_requests")
      .insert({
        request_number: requestNumber,
        user_id: staff.id,
        department_id: staff.department_id || null,
        corporate_email: `${String(staff.employee_id || "staff").toLowerCase()}@simulation.local`,
        staff_number: staff.employee_id || "SIM-STAFF",
        staff_rank: staff.position || "Senior",
        loan_type_key: loanType.loan_key,
        loan_type_label: loanType.loan_label,
        requested_amount: Number(loanType.fixed_amount || 25000),
        fixed_amount: Number(loanType.fixed_amount || 25000),
        reason: `Created by ${runId}`,
        requires_fd_check: true,
        committee_required: true,
        status: "pending_hod",
        hod_reviewer_id: hod.id,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id, status")

    if (createError) throw createError
    const requestId = createdRows?.[0]?.id
    assertOk(requestId, "Failed to create loan request")
    createdRequestIds.push(requestId)

    console.log(`[SIM][CREATE] Request created: ${requestId} (${requestNumber})`)

    const timelineRows = []
    const pushTimeline = (actorId, actorRole, actionKey, fromStatus, toStatus, note) => {
      timelineRows.push({
        loan_request_id: requestId,
        actor_id: actorId,
        actor_role: actorRole,
        action_key: actionKey,
        from_status: fromStatus,
        to_status: toStatus,
        note,
        metadata: { simulation: true, run_id: runId },
        created_at: new Date().toISOString(),
      })
    }

    pushTimeline(admin.id, admin.role, "staff_submit", null, "pending_hod", "Simulation create")

    const { data: readRow, error: readError } = await supabase
      .from("loan_requests")
      .select("id, status, reason")
      .eq("id", requestId)
      .single()

    if (readError) throw readError
    assertOk(readRow.status === "pending_hod", "Initial status is not pending_hod")
    console.log(`[SIM][READ] Request status confirmed: ${readRow.status}`)

    const { error: updateError } = await supabase
      .from("loan_requests")
      .update({ reason: `Updated by ${runId}`, updated_at: new Date().toISOString() })
      .eq("id", requestId)

    if (updateError) throw updateError
    pushTimeline(staff.id, staff.role, "staff_edit", "pending_hod", "pending_hod", "Simulation update")
    console.log("[SIM][UPDATE] Request reason updated")

    const stepUpdate = async (label, actor, fromStatus, toStatus, patch, actionKey, note) => {
      const { error } = await supabase
        .from("loan_requests")
        .update({ ...patch, status: toStatus, updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("status", fromStatus)

      if (error) throw error
      pushTimeline(actor.id, actor.role, actionKey, fromStatus, toStatus, note)
      console.log(`[SIM][${label}] ${fromStatus} -> ${toStatus}`)
    }

    await stepUpdate(
      "HOD",
      hod,
      "pending_hod",
      "hod_approved",
      { hod_reviewer_id: hod.id, hod_review_note: `Approved ${runId}`, hod_decision_at: new Date().toISOString() },
      "hod_decision",
      "HOD approval",
    )

    await stepUpdate(
      "LOAN_OFFICE",
      loanOffice,
      "hod_approved",
      "sent_to_accounts",
      {
        loan_office_reviewer_id: loanOffice.id,
        loan_office_note: `Forwarded ${runId}`,
        loan_office_forwarded_at: new Date().toISOString(),
      },
      "loan_office_forward",
      "Loan office forward",
    )

    await stepUpdate(
      "ACCOUNTS",
      accounts,
      "sent_to_accounts",
      "awaiting_committee",
      {
        accounts_reviewer_id: accounts.id,
        fd_score: 45,
        fd_note: `FD passed ${runId}`,
        fd_checked_at: new Date().toISOString(),
        fd_good: true,
      },
      "accounts_fd_update",
      "FD good",
    )

    await stepUpdate(
      "COMMITTEE",
      committee,
      "awaiting_committee",
      "awaiting_hr_terms",
      {
        committee_reviewer_id: committee.id,
        committee_note: `Committee approved ${runId}`,
        committee_decision_at: new Date().toISOString(),
      },
      "committee_decision",
      "Committee approval",
    )

    await stepUpdate(
      "HR",
      hr,
      "awaiting_hr_terms",
      "awaiting_director_hr",
      {
        hr_officer_id: hr.id,
        hr_note: `HR terms set ${runId}`,
        disbursement_date: new Date().toISOString().slice(0, 10),
        recovery_start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        recovery_months: 12,
        hr_forwarded_at: new Date().toISOString(),
      },
      "hr_set_terms",
      "HR terms set",
    )

    await stepUpdate(
      "DIRECTOR",
      director,
      "awaiting_director_hr",
      "approved_director",
      {
        director_hr_id: director.id,
        director_signature_mode: "typed",
        director_signature_text: "SIM DIRECTOR",
        director_letter: `Approved in simulation ${runId}`,
        director_note: `Director approved ${runId}`,
        director_decision_at: new Date().toISOString(),
      },
      "director_finalize",
      "Director approval",
    )

    if (timelineRows.length > 0) {
      const { error: timelineError } = await supabase.from("loan_request_timeline").insert(timelineRows)
      if (timelineError) throw timelineError
    }

    const { data: finalRow, error: finalError } = await supabase
      .from("loan_requests")
      .select("id, status, reason, fd_score, fd_good")
      .eq("id", requestId)
      .single()

    if (finalError) throw finalError
    assertOk(finalRow.status === "approved_director", "Final status is not approved_director")

    console.log("[SIM] Full actor workflow completed successfully")
    console.log(`[SIM] Final status: ${finalRow.status}`)

    // Revert
    console.log("[SIM][REVERT] Deleting simulation timeline rows and request...")

    const { error: delTimelineError } = await supabase
      .from("loan_request_timeline")
      .delete()
      .eq("loan_request_id", requestId)
      .or(`note.ilike.%${runId}%,metadata->>run_id.eq.${runId}`)

    if (delTimelineError) {
      console.warn("[SIM][REVERT] Timeline filtered delete warning:", delTimelineError.message)
    }

    const { error: deleteReqError } = await supabase.from("loan_requests").delete().eq("id", requestId)
    if (deleteReqError) throw deleteReqError

    console.log("[SIM][REVERT] Request deleted")

    const { data: verifyDeleted, error: verifyDeletedError } = await supabase
      .from("loan_requests")
      .select("id")
      .eq("id", requestId)

    if (verifyDeletedError) throw verifyDeletedError
    assertOk((verifyDeleted || []).length === 0, "Revert verification failed: request still exists")

    console.log("[SIM] Revert verification passed")
    console.log("[SIM] CRUD + actor workflow + revert: PASS")
  } catch (error) {
    console.error("[SIM] FAILED:", error?.message || error)
    process.exitCode = 1
  } finally {
    if (createdRequestIds.length > 0) {
      const { error: fallbackDeleteError } = await supabase
        .from("loan_requests")
        .delete()
        .in("id", createdRequestIds)
      if (fallbackDeleteError) {
        console.warn("[SIM][FINALLY] Fallback cleanup warning:", fallbackDeleteError.message)
      }
    }
  }
}

run()

import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  canDoAccounts,
  canDoCommittee,
  canDoDirectorHr,
  canDoHrOffice,
  canDoLoanOffice,
  isSchemaIssue,
  normalizeRole,
} from "@/lib/loan-workflow"

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, email, role, position, department_id, departments(name, code)")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = normalizeRole((profile as any).role)
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null

    const [typesRes, myRes] = await Promise.all([
      admin
        .from("loan_types")
        .select("loan_key, loan_label, category, requires_committee, requires_fd_check, min_fd_score, min_qualification_note, fixed_amount, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("loan_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ])

    if (typesRes.error && isSchemaIssue(typesRes.error)) {
      const viewAllTabs =
        role === "admin" || role === "loan_officer" || role === "director_hr" || role === "hr_director"
      return NextResponse.json(
        {
          degraded: true,
          warning: "Loan module tables are not available yet. Run scripts/051_loan_module_workflow.sql in Supabase SQL Editor.",
          profile,
          role,
          loanTypes: [],
          myRequests: [],
          myTimelines: [],
          inbox: {
            hod: [],
            loanOffice: [],
            accounts: [],
            accountsSigned: [],
            committee: [],
            hrOffice: [],
            directorHr: [],
            allLoans: [],
          },
          permissions: {
            hod: ["department_head", "regional_manager", "admin"].includes(role),
            loanOffice: canDoLoanOffice(role, deptName, deptCode),
            accounts: canDoAccounts(role, deptName, deptCode),
            committee: canDoCommittee(role),
            hrOffice: canDoHrOffice(role, deptName, deptCode),
            directorHr: canDoDirectorHr(role, deptName, deptCode),
            viewAllTabs,
          },
        },
        { status: 200 },
      )
    }

    if (typesRes.error) throw typesRes.error
    if (myRes.error) throw myRes.error

    // viewAllTabs: admin, loan_officer (HR Loan Office), director_hr see all tabs
    const viewAllTabs =
      role === "admin" || role === "loan_officer" || role === "director_hr" || role === "hr_director"

    const permissions = {
      hod: ["department_head", "regional_manager", "admin"].includes(role),
      loanOffice: canDoLoanOffice(role, deptName, deptCode),
      accounts: canDoAccounts(role, deptName, deptCode),
      committee: canDoCommittee(role),
      hrOffice: canDoHrOffice(role, deptName, deptCode),
      directorHr: canDoDirectorHr(role, deptName, deptCode),
      viewAllTabs,
    }

    // HOD query: dept_head sees own dept; admin / regional_manager / viewAllTabs see all
    let hodQuery = admin
      .from("loan_requests")
      .select("*")
      .eq("status", "pending_hod")
      .order("created_at", { ascending: false })

    if (role === "department_head" && (profile as any).department_id) {
      hodQuery = hodQuery.eq("department_id", (profile as any).department_id)
    }

    const showHod = permissions.hod || viewAllTabs
    const showLoanOffice = permissions.loanOffice || viewAllTabs
    const showAccounts = permissions.accounts || viewAllTabs
    const showCommittee = permissions.committee || viewAllTabs
    const showHrOffice = permissions.hrOffice || viewAllTabs
    const showDirectorHr = permissions.directorHr || viewAllTabs

    // HR loan office (loan_officer + viewAllTabs) sees all non-terminal loans
    const hrOfficeQ: any = !showHrOffice
      ? Promise.resolve({ data: [], error: null })
      : (viewAllTabs && role === "loan_officer")
        ? admin.from("loan_requests").select("*")
            .not("status", "in", '("hod_rejected","director_rejected","rejected_fd","committee_rejected")')
            .order("created_at", { ascending: false })
        : admin.from("loan_requests").select("*").eq("status", "awaiting_hr_terms").order("created_at", { ascending: false })

    const myRequestIds = (myRes.data || []).map((r: any) => r.id)

    const [hodRes, loanOfficeRes, accountsRes, accountsSignedRes, committeeRes, hrRes, directorRes, allLoansRes, timelinesRes] = await Promise.all([
      showHod ? hodQuery : Promise.resolve({ data: [], error: null } as any),
      showLoanOffice
        ? admin.from("loan_requests").select("*").eq("status", "hod_approved").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      showAccounts
        ? admin.from("loan_requests").select("*").eq("status", "sent_to_accounts").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      showAccounts
        ? admin.from("loan_requests").select("*").eq("status", "approved_director").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      showCommittee
        ? admin.from("loan_requests").select("*").eq("status", "awaiting_committee").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      hrOfficeQ,
      showDirectorHr
        ? admin.from("loan_requests").select("*").eq("status", "awaiting_director_hr").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      viewAllTabs
        ? admin.from("loan_requests").select("*").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      myRequestIds.length > 0
        ? admin.from("loan_request_timeline").select("*").in("loan_request_id", myRequestIds).order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null } as any),
    ])

    const responses = [hodRes, loanOfficeRes, accountsRes, accountsSignedRes, committeeRes, hrRes, directorRes, allLoansRes, timelinesRes]
    const schemaError = responses.find((r: any) => r?.error && isSchemaIssue(r.error))
    if (schemaError) {
      return NextResponse.json(
        {
          degraded: true,
          warning: "Loan module schema is not ready. Run scripts/051_loan_module_workflow.sql and refresh.",
          profile,
          role,
          permissions,
          loanTypes: typesRes.data || [],
          myRequests: myRes.data || [],
          myTimelines: [],
          inbox: {
            hod: [],
            loanOffice: [],
            accounts: [],
            accountsSigned: [],
            committee: [],
            hrOffice: [],
            directorHr: [],
            allLoans: [],
          },
        },
        { status: 200 },
      )
    }

    for (const res of responses) {
      if (res?.error) throw res.error
    }

    // Group timelines by loan_request_id
    const timelinesMap: Record<string, any[]> = {}
    for (const entry of (timelinesRes.data || [])) {
      if (!timelinesMap[entry.loan_request_id]) timelinesMap[entry.loan_request_id] = []
      timelinesMap[entry.loan_request_id].push(entry)
    }
    const myTimelines = myRequestIds.map((id: string) => ({
      loan_request_id: id,
      entries: timelinesMap[id] || [],
    }))

    return NextResponse.json({
      degraded: false,
      profile: {
        id: (profile as any).id,
        firstName: (profile as any).first_name,
        lastName: (profile as any).last_name,
        employeeId: (profile as any).employee_id,
        email: (profile as any).email || user.email,
        role: (profile as any).role,
        position: (profile as any).position,
        departmentId: (profile as any).department_id,
        departmentName: (profile as any)?.departments?.name || null,
      },
      role,
      permissions,
      loanTypes: typesRes.data || [],
      myRequests: myRes.data || [],
      myTimelines,
      inbox: {
        hod: hodRes.data || [],
        loanOffice: loanOfficeRes.data || [],
        accounts: accountsRes.data || [],
        accountsSigned: accountsSignedRes.data || [],
        committee: committeeRes.data || [],
        hrOffice: hrRes.data || [],
        directorHr: directorRes.data || [],
        allLoans: allLoansRes.data || [],
      },
    })
  } catch (error: any) {
    console.error("loan workflow get error", error)
    return NextResponse.json({ error: error?.message || "Failed to load loan workflow" }, { status: 500 })
  }
}

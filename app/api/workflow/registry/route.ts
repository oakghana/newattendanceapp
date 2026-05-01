import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { canDoDirectorHr, canDoHrOffice, canDoLoanOffice, normalizeRole } from "@/lib/loan-workflow"

function canManageTemplates(role: string, deptName?: string | null, deptCode?: string | null) {
  return (
    role === "admin" ||
    role === "hr_leave_office" ||
    canDoHrOffice(role, deptName, deptCode) ||
    canDoDirectorHr(role, deptName, deptCode) ||
    canDoLoanOffice(role, deptName, deptCode)
  )
}

export async function GET(request: NextRequest) {
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

    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, role, departments(name, code)")
      .eq("id", user.id)
      .maybeSingle()

    const role = normalizeRole((profile as any)?.role)
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null
    const domains = (request.nextUrl.searchParams.get("domains") || "loan,leave")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value === "loan" || value === "leave")

    const [signaturesRes, templatesRes] = await Promise.all([
      admin
        .from("approval_signature_registry")
        .select("id, workflow_domain, approval_stage, signature_mode, signature_text, signature_data_url, is_active, updated_at")
        .eq("user_id", user.id)
        .order("workflow_domain", { ascending: true }),
      admin
        .from("workflow_message_templates")
        .select("id, workflow_domain, template_key, title, subject, body, is_active, updated_at")
        .in("workflow_domain", domains.length > 0 ? domains : ["loan", "leave"])
        .order("workflow_domain", { ascending: true })
        .order("template_key", { ascending: true }),
    ])

    if (signaturesRes.error) throw signaturesRes.error
    if (templatesRes.error) throw templatesRes.error

    return NextResponse.json({
      signatures: signaturesRes.data || [],
      templates: templatesRes.data || [],
      canManageTemplates: canManageTemplates(role, deptName, deptCode),
    })
  } catch (error: any) {
    console.error("workflow registry get error", error)
    return NextResponse.json({ error: error?.message || "Failed to load workflow registry" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, role, departments(name, code)")
      .eq("id", user.id)
      .maybeSingle()

    const role = normalizeRole((profile as any)?.role)
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null

    const body = await request.json()
    const action = String(body?.action || "")

    if (action === "upsert_signature") {
      const workflowDomain = String(body?.workflow_domain || "").trim().toLowerCase()
      const approvalStage = String(body?.approval_stage || "").trim().toLowerCase()
      const signatureMode = String(body?.signature_mode || "typed").trim().toLowerCase()
      const signatureText = String(body?.signature_text || "").trim() || null
      const signatureDataUrl = String(body?.signature_data_url || "").trim() || null

      if (!workflowDomain || !approvalStage) {
        return NextResponse.json({ error: "workflow_domain and approval_stage are required" }, { status: 400 })
      }

      if (!["typed", "draw", "upload"].includes(signatureMode)) {
        return NextResponse.json({ error: "Unsupported signature mode" }, { status: 400 })
      }

      if (!signatureText && !signatureDataUrl) {
        return NextResponse.json({ error: "A typed or uploaded signature is required" }, { status: 400 })
      }

      const { data, error } = await admin
        .from("approval_signature_registry")
        .upsert(
          {
            user_id: user.id,
            workflow_domain: workflowDomain,
            approval_stage: approvalStage,
            signature_mode: signatureMode,
            signature_text: signatureText,
            signature_data_url: signatureDataUrl,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,workflow_domain,approval_stage" },
        )
        .select("id, workflow_domain, approval_stage, signature_mode, signature_text, signature_data_url, is_active, updated_at")
        .single()

      if (error) throw error
      return NextResponse.json({ success: true, data })
    }

    if (action === "upsert_template") {
      if (!canManageTemplates(role, deptName, deptCode)) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
      }

      const workflowDomain = String(body?.workflow_domain || "").trim().toLowerCase()
      const templateKey = String(body?.template_key || "").trim().toLowerCase()
      const title = String(body?.title || "").trim()
      const subject = String(body?.subject || "").trim() || null
      const templateBody = String(body?.body || "").trim()
      const isActive = body?.is_active !== false

      if (!workflowDomain || !templateKey || !title || !templateBody) {
        return NextResponse.json({ error: "workflow_domain, template_key, title and body are required" }, { status: 400 })
      }

      const { data, error } = await admin
        .from("workflow_message_templates")
        .upsert(
          {
            workflow_domain: workflowDomain,
            template_key: templateKey,
            title,
            subject,
            body: templateBody,
            is_active: isActive,
            updated_by: user.id,
            created_by: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workflow_domain,template_key" },
        )
        .select("id, workflow_domain, template_key, title, subject, body, is_active, updated_at")
        .single()

      if (error) throw error
      return NextResponse.json({ success: true, data })
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
  } catch (error: any) {
    console.error("workflow registry post error", error)
    return NextResponse.json({ error: error?.message || "Failed to update workflow registry" }, { status: 500 })
  }
}
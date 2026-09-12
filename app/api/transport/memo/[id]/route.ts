import { NextRequest, NextResponse } from "next/server"
import { jsPDF } from "jspdf"
import fs from "fs"
import path from "path"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { isRegionalHrRole, isRegionalManagerRole, normalizeAppRole } from "@/lib/role-capabilities"
import { isNonRegionalLocation } from "@/lib/location-mappings"
import { isRegionalManagerLocationMatch, loadLocationHierarchyMap } from "@/lib/regional-manager-scope"

export const runtime = "nodejs"

function formatMemoDate(value: string | null) {
  if (!value) return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
}

function parseAmendments(value: string | null) {
  try {
    const parsed = value ? JSON.parse(value) : null
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, authError } = await createClientAndGetUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const admin = await createAdminClient()
  const [{ data: viewer }, { data: memo }] = await Promise.all([
    admin.from("user_profiles").select("id, role, assigned_location_id").eq("id", user.id).maybeSingle(),
    admin.from("transport_requests").select("id, request_type, status, workflow_stage, origin_location_id, memo_reference, memo_date, memo_subject, memo_body, memo_amendments, hr_executive_signer_id, hr_executive_signed_at, hr_executive_signature_data_url").eq("id", id).maybeSingle(),
  ])

  if (!viewer || !memo) return NextResponse.json({ error: "Memo not found" }, { status: 404 })
  if (memo.request_type !== "regional_transport" || !memo.hr_executive_signed_at || !memo.hr_executive_signer_id || !memo.hr_executive_signature_data_url) {
    return NextResponse.json({ error: "The official signed memo is not available yet." }, { status: 409 })
  }

  const role = normalizeAppRole(viewer.role)
  const isCentralMemoOffice = ["admin", "hr_records", "hr_records_officer", "hr_records_manager"].includes(role)
  let canAccess = isCentralMemoOffice || memo.hr_executive_signer_id === user.id
  if (!canAccess && (isRegionalManagerRole(role) || isRegionalHrRole(role))) {
    const locations = await loadLocationHierarchyMap(admin, [viewer.assigned_location_id, memo.origin_location_id])
    const originLocation = locations.get(String(memo.origin_location_id || ""))
    canAccess = Boolean(
      memo.origin_location_id &&
      !isNonRegionalLocation(originLocation?.name) &&
      isRegionalManagerLocationMatch(memo.origin_location_id, originLocation, viewer.assigned_location_id, locations),
    )
  }
  if (!canAccess) return NextResponse.json({ error: "This memo is outside your assigned office." }, { status: 403 })

  const amendments = parseAmendments(memo.memo_amendments)
  const [locationResult, signerResult] = await Promise.all([
    memo.origin_location_id
      ? admin.from("geofence_locations").select("name").eq("id", memo.origin_location_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("user_profiles").select("first_name, last_name, position").eq("id", memo.hr_executive_signer_id).maybeSingle(),
  ])
  const signerName = String(amendments.hr_executive_signer_name || `${signerResult.data?.first_name || ""} ${signerResult.data?.last_name || ""}`.trim() || "HUMAN RESOURCES EXECUTIVE")
  const signerPosition = String(amendments.hr_executive_signer_position || signerResult.data?.position || "HUMAN RESOURCES MANAGER")
  const recipient = String(locationResult.data?.name || "REGIONAL OFFICE").toUpperCase()

  const pdf = new jsPDF({ unit: "mm", format: "a4" })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 22
  let logoBase64: string | null = null
  try {
    logoBase64 = fs.readFileSync(path.join(process.cwd(), "public", "images", "qcc-logo.png")).toString("base64")
  } catch {
    // A valid signed memo must still be printable if a deployment lacks the local logo asset.
  }
  if (logoBase64) pdf.addImage(`data:image/png;base64,${logoBase64}`, "PNG", margin, 15, 19, 19)
  pdf.setFont("times", "bold")
  pdf.setFontSize(15)
  pdf.text("QUALITY CONTROL COMPANY LTD.", pageWidth / 2, 21, { align: "center" })
  pdf.setFontSize(11)
  pdf.text("(COCOBOD)", pageWidth / 2, 27, { align: "center" })
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(8.5)
  pdf.text("HEAD OFFICE - ACCRA, GHANA", pageWidth / 2, 33, { align: "center" })
  pdf.setDrawColor(20, 110, 100)
  pdf.setLineWidth(0.7)
  pdf.line(margin, 39, pageWidth - margin, 39)

  pdf.setFontSize(10)
  pdf.text(`Our Ref: ${memo.memo_reference || "-"}`, margin, 51)
  pdf.text(`Date: ${formatMemoDate(memo.memo_date)}`, pageWidth - margin, 51, { align: "right" })
  pdf.setFont("helvetica", "bold")
  pdf.text("TO:", margin, 64)
  pdf.text(recipient, margin, 70)
  pdf.setFont("helvetica", "normal")
  pdf.text("QUALITY CONTROL COMPANY LTD.", margin, 76)

  const subject = String(memo.memo_subject || "RE: APPROVED TRANSPORT REQUEST")
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(11)
  const subjectLines = pdf.splitTextToSize(subject.toUpperCase(), pageWidth - margin * 2)
  pdf.text(subjectLines, margin, 93)
  const subjectBottom = 93 + (subjectLines.length - 1) * 5.5
  pdf.setLineWidth(0.25)
  pdf.line(margin, subjectBottom + 2, pageWidth - margin, subjectBottom + 2)

  pdf.setFont("times", "normal")
  pdf.setFontSize(11)
  const bodyLines = pdf.splitTextToSize(String(memo.memo_body || ""), pageWidth - margin * 2)
  const bodyStart = subjectBottom + 15
  pdf.text(bodyLines, margin, bodyStart, { lineHeightFactor: 1.6 })
  const signatureY = Math.min(238, bodyStart + bodyLines.length * 6.2 + 16)
  pdf.addImage(memo.hr_executive_signature_data_url, undefined, margin, signatureY, 45, 17)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text(signerName.toUpperCase(), margin, signatureY + 25)
  pdf.setFont("helvetica", "normal")
  pdf.text(signerPosition.toUpperCase(), margin, signatureY + 31)
  pdf.text("FOR: MANAGEMENT", margin, signatureY + 37)
  pdf.setDrawColor(160, 160, 160)
  pdf.line(margin, 270, pageWidth - margin, 270)
  pdf.setFontSize(8.5)
  pdf.text("CC: Deputy Director HR | Audit Manager | Deputy Transport Manager", margin, 277)
  pdf.text(`Electronically signed on ${formatMemoDate(memo.hr_executive_signed_at)}`, pageWidth - margin, 277, { align: "right" })

  return new NextResponse(Buffer.from(pdf.output("arraybuffer")), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="regional-transport-memo-${String(memo.memo_reference || memo.id).replace(/[^a-z0-9_-]/gi, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
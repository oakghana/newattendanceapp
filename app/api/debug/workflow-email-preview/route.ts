import { NextResponse } from "next/server"
import {
  renderWorkflowEmailPreview,
  type WorkflowEmailPreviewTemplate,
} from "@/lib/workflow-emails"

const VALID_TEMPLATES: WorkflowEmailPreviewTemplate[] = [
  "leave-submitted",
  "leave-hr-approved",
  "loan-hod-approved",
  "loan-approved",
]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const templateParam = String(searchParams.get("template") || "loan-hod-approved")
  const template = VALID_TEMPLATES.includes(templateParam as WorkflowEmailPreviewTemplate)
    ? (templateParam as WorkflowEmailPreviewTemplate)
    : "loan-hod-approved"

  const html = renderWorkflowEmailPreview(template)

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-email-template": template,
    },
  })
}

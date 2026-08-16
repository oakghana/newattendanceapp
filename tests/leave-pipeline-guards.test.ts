import { describe, expect, it } from "vitest"
import {
  canNonRegionalPipelineAct,
  canRegionalPipelineAct,
  isRegionalWorkflowRoute,
  hrRecordsCanReference,
} from "../lib/hr-workflow"

describe("cross-route pipeline guards", () => {
  it("identifies the regional workflow route case-insensitively", () => {
    expect(isRegionalWorkflowRoute("regional")).toBe(true)
    expect(isRegionalWorkflowRoute("REGIONAL")).toBe(true)
    expect(isRegionalWorkflowRoute("legacy")).toBe(false)
    expect(isRegionalWorkflowRoute(null)).toBe(false)
    expect(isRegionalWorkflowRoute(undefined)).toBe(false)
  })

  it("lets HOD Review, HR Leave Office, and HR Executive act only on non-regional requests", () => {
    expect(canNonRegionalPipelineAct("legacy")).toBe(true)
    expect(canNonRegionalPipelineAct(null)).toBe(true)
    expect(canNonRegionalPipelineAct("regional")).toBe(false)
  })

  it("lets Regional HR Office forwarding and Regional Manager approval act only on regional requests", () => {
    expect(canRegionalPipelineAct("regional")).toBe(true)
    expect(canRegionalPipelineAct("legacy")).toBe(false)
    expect(canRegionalPipelineAct(null)).toBe(false)
  })

  it("keeps the two pipelines mutually exclusive for every workflow_route value", () => {
    for (const workflowRoute of ["regional", "legacy", null, undefined, ""]) {
      expect(canNonRegionalPipelineAct(workflowRoute)).toBe(!canRegionalPipelineAct(workflowRoute))
    }
  })
})

describe("HR Records reference gate", () => {
  it("blocks HR Records from referencing before HR Executive has approved", () => {
    expect(hrRecordsCanReference("pending_hod_review")).toBe(false)
    expect(hrRecordsCanReference("hod_approved")).toBe(false)
    expect(hrRecordsCanReference("hr_office_forwarded")).toBe(false)
  })

  it("allows HR Records to reference once HR Executive has approved", () => {
    expect(hrRecordsCanReference("hr_approved")).toBe(true)
  })

  it("allows HR Records to reference while explicitly awaiting its own action", () => {
    expect(hrRecordsCanReference("pending_hr_records_reference")).toBe(true)
  })

  it("allows HR Records to reference a director-approved loan", () => {
    expect(hrRecordsCanReference("approved_director", "loan")).toBe(true)
    expect(hrRecordsCanReference("hr_approved", "loan")).toBe(false)
    expect(hrRecordsCanReference("pending_hod_review", "loan")).toBe(false)
  })

  it("never allows HR Records to reference a regional-only status", () => {
    expect(hrRecordsCanReference("pending_regional_manager_approval")).toBe(false)
    expect(hrRecordsCanReference("approved")).toBe(false)
  })
})

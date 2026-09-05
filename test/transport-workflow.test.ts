import { describe, expect, it } from "vitest"
import {
  deskStagesForRole,
  isAssignableRegionalStage,
  isCompletableTransportStage,
  transportSla,
  transportStageLabel,
} from "../lib/transport-workflow"

describe("transport-workflow", () => {
  it("labels key stages", () => {
    expect(transportStageLabel("hr_executive_signing")).toContain("HR Executive")
    expect(transportStageLabel("referenced")).toContain("assign")
  })

  it("computes SLA tones from age", () => {
    const now = Date.parse("2026-09-04T12:00:00Z")
    expect(
      transportSla({
        workflowStage: "hr_executive_signing",
        updatedAt: "2026-09-04T08:00:00Z",
        now,
      }).tone,
    ).toBe("ok")
    expect(
      transportSla({
        workflowStage: "hr_executive_signing",
        updatedAt: "2026-08-31T12:00:00Z",
        now,
      }).tone,
    ).toBe("watch")
    expect(
      transportSla({
        workflowStage: "hr_executive_signing",
        updatedAt: "2026-08-28T12:00:00Z",
        now,
      }).tone,
    ).toBe("overdue")
    expect(
      transportSla({
        workflowStage: "completed",
        status: "completed",
        updatedAt: "2026-08-01T12:00:00Z",
        now,
      }).tone,
    ).toBe("terminal")
  })

  it("maps desk stages and assign/complete guards", () => {
    expect(deskStagesForRole("manager_hr")).toContain("hr_executive_signing")
    expect(deskStagesForRole("transport_manager")).toContain("referenced")
    expect(isAssignableRegionalStage("referenced")).toBe(true)
    expect(isCompletableTransportStage("assigned", "assigned")).toBe(true)
  })
})

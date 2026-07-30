"use client"

import { Suspense } from "react"
import { ResumptionCountdownWidget } from "./resumption-countdown-widget"

export function DashboardCountdownWrapper() {
  return (
    <Suspense fallback={null}>
      <ResumptionCountdownWidget autoPlaySound={true} />
    </Suspense>
  )
}

"use client"

import useSWR from "swr"
import { CalendarClock, CalendarCheck2, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

type DepartmentConflict = {
  id: string
  staff_name: string
  position: string | null
  start_date: string
  end_date: string
}

type DepartmentConflictResponse = {
  applicable: boolean
  department?: string | null
  conflicts: DepartmentConflict[]
  suggested_start_date?: string
}

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((res) => res.json())

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

type Props = {
  startDate: string
  endDate: string
  leaveType: string
  onUseSuggestedStart: (date: string) => void
}

export function DepartmentDateConflictNotice({ startDate, endDate, leaveType, onUseSuggestedStart }: Props) {
  const isAnnual = leaveType === "annual" || leaveType === "annual_leave"
  const key = isAnnual && startDate
    ? `/api/leave/planning/department-conflicts?start=${startDate}&end=${endDate || startDate}`
    : null

  const { data } = useSWR<DepartmentConflictResponse>(key, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  if (!isAnnual || !startDate || !data?.applicable || data.conflicts.length === 0) return null

  const suggested = data.suggested_start_date

  return (
    <section
      role="alert"
      aria-live="polite"
      className="overflow-hidden rounded-xl border border-amber-300 bg-amber-50 shadow-sm"
    >
      <header className="flex items-start gap-3 border-b border-amber-200 bg-amber-100/70 px-4 py-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-800">Official Notice</p>
          <h4 className="text-sm font-semibold text-amber-950 text-balance">
            These dates have already been assigned by your HOD
          </h4>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-900 text-pretty">
            {data.department ? `${data.department} department. ` : ""}
            The period you selected overlaps with annual leave already approved for{" "}
            {data.conflicts.length === 1 ? "a colleague" : `${data.conflicts.length} colleagues`} in your department.
            You may still submit, but the HOD&apos;s assigned dates take precedence and your request may be adjusted.
          </p>
        </div>
      </header>

      <ul className="divide-y divide-amber-200/70">
        {data.conflicts.map((conflict) => (
          <li key={conflict.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <CalendarClock className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-amber-950">{conflict.staff_name}</p>
                {conflict.position && <p className="truncate text-xs text-amber-800">{conflict.position}</p>}
              </div>
            </div>
            <span className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900">
              {formatDate(conflict.start_date)} &ndash; {formatDate(conflict.end_date)}
            </span>
          </li>
        ))}
      </ul>

      {suggested && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 bg-white/60 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-amber-900">
            <CalendarCheck2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <span>
              Next available start date: <strong className="text-emerald-800">{formatDate(suggested)}</strong>
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-emerald-600 text-emerald-800 hover:bg-emerald-50"
            onClick={() => onUseSuggestedStart(suggested)}
          >
            Use this date
          </Button>
        </footer>
      )}
    </section>
  )
}

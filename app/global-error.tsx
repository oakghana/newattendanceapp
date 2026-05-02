"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, Home, RefreshCcw, ShieldCheck } from "lucide-react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[v0] Global application error:", error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#0f172a_45%,_#020617)] text-white">
          <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-10">
            <section className="w-full rounded-2xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-300/15 px-3 py-1 text-sm text-amber-200">
                <ShieldCheck className="h-4 w-4" />
                System Recovery Mode
              </div>

              <div className="mb-6 flex items-start gap-3">
                <div className="rounded-xl bg-red-500/20 p-2">
                  <AlertTriangle className="h-6 w-6 text-red-300" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">We hit a temporary app issue</h1>
                  <p className="mt-2 text-sm text-slate-200">
                    Your action was received, but part of the page failed to render. Please retry. If this keeps happening,
                    go back to the dashboard and continue safely.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={reset}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 font-semibold text-emerald-950 hover:bg-emerald-400"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Try Again
                </button>

                <Link
                  href="/dashboard"
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 font-semibold text-white hover:bg-white/10"
                >
                  <Home className="h-4 w-4" />
                  Back To Dashboard
                </Link>
              </div>

              <p className="mt-5 text-xs text-slate-300">Reference: {error?.digest || "n/a"}</p>
            </section>
          </div>
        </main>
      </body>
    </html>
  )
}

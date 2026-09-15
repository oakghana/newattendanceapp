import { headers } from "next/headers"
import { CheckCircle2, ShieldAlert, ShieldX, XCircle } from "lucide-react"
import { getMemoTypeLabel, lookupVerificationCode } from "@/lib/memo-security"

export const dynamic = "force-dynamic"

function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default async function VerifyMemoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const headerList = await headers()
  const ipAddress = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || null
  const userAgent = headerList.get("user-agent") || null

  const result = await lookupVerificationCode(code, { ipAddress, userAgent })
  const displayCode = code.trim().toUpperCase()

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {!result.found && (
            <>
              <XCircle className="mb-3 size-12 text-destructive" aria-hidden="true" />
              <h1 className="text-xl font-semibold text-foreground">Memo Not Found</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {"We couldn't find a memo matching this verification code. It may be mistyped, or the code does not exist in our records."}
              </p>
            </>
          )}

          {result.found && result.status === "active" && (
            <>
              <CheckCircle2 className="mb-3 size-12 text-primary" aria-hidden="true" />
              <h1 className="text-xl font-semibold text-foreground">Memo Verified</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                This is a genuine memo issued by the Human Resource Directorate.
              </p>
            </>
          )}

          {result.found && result.status === "revoked" && (
            <>
              <ShieldX className="mb-3 size-12 text-destructive" aria-hidden="true" />
              <h1 className="text-xl font-semibold text-foreground">Memo Revoked</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                This memo has been revoked and is no longer valid.
              </p>
            </>
          )}

          {result.found && result.status === "superseded" && (
            <>
              <ShieldAlert className="mb-3 size-12 text-accent" aria-hidden="true" />
              <h1 className="text-xl font-semibold text-foreground">Memo Superseded</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                A newer version of this memo has been issued. This copy is no longer current.
              </p>
            </>
          )}
        </div>

        <div className="rounded-md border border-border bg-secondary/50 p-4">
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Verification code</dt>
              <dd className="font-mono font-medium text-foreground">{displayCode}</dd>
            </div>
            {result.found && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Memo type</dt>
                  <dd className="text-right font-medium text-foreground">{getMemoTypeLabel(result.memoType || "")}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Reference number</dt>
                  <dd className="text-right font-medium text-foreground">{result.referenceNumber || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Staff name</dt>
                  <dd className="text-right font-medium text-foreground">{result.staffName || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Issued</dt>
                  <dd className="text-right font-medium text-foreground">{formatDate(result.issuedAt)}</dd>
                </div>
                {result.lockedAt && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Finalized</dt>
                    <dd className="text-right font-medium text-foreground">{formatDate(result.lockedAt)}</dd>
                  </div>
                )}
                {result.status === "revoked" && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Revoked</dt>
                    <dd className="text-right font-medium text-foreground">{formatDate(result.revokedAt)}</dd>
                  </div>
                )}
              </>
            )}
          </dl>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          This page confirms whether a memo code was genuinely issued. It does not display the full contents of the
          memo. If you suspect a memo has been altered, contact the Human Resource Directorate.
        </p>
      </div>
    </main>
  )
}

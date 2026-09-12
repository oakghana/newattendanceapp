"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { buildMemoFieldChanges, countMemoEdits, type MemoDiffToken } from "@/lib/memo-change-tracking"
import { Eye, FilePenLine, RotateCcw } from "lucide-react"

function DiffPreview({ tokens }: { tokens: MemoDiffToken[] }) {
  if (tokens.length === 0) {
    return <p className="text-xs text-slate-400 italic">No content yet.</p>
  }
  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
      {tokens.map((token, index) => {
        if (token.type === "add") {
          return (
            <mark key={`${token.type}-${index}`} className="rounded-sm bg-emerald-100 text-emerald-900 px-0.5">
              {token.text}
            </mark>
          )
        }
        if (token.type === "del") {
          return (
            <del key={`${token.type}-${index}`} className="rounded-sm bg-rose-100 text-rose-800 px-0.5 decoration-rose-400">
              {token.text}
            </del>
          )
        }
        return <span key={`${token.type}-${index}`}>{token.text}</span>
      })}
    </p>
  )
}

type TrackedMemoEditorProps = {
  originalSubject?: string | null
  originalBody?: string | null
  originalCc?: string | null
  subject: string
  body: string
  cc?: string
  onSubjectChange?: (value: string) => void
  onBodyChange?: (value: string) => void
  onCcChange?: (value: string) => void
  showCc?: boolean
  readOnly?: boolean
  title?: string
  originalLabel?: string
  currentLabel?: string
  subjectPlaceholder?: string
  bodyPlaceholder?: string
  bodyLabel?: string
  ccLabel?: string
  ccPlaceholder?: string
  fixedCcRecipients?: string[]
  bodyRows?: number
}

export function TrackedMemoEditor({
  originalSubject = "",
  originalBody = "",
  originalCc = "",
  subject,
  body,
  cc = "",
  onSubjectChange,
  onBodyChange,
  onCcChange,
  showCc = false,
  readOnly = false,
  title = "Memo editor",
  originalLabel = "Forwarded draft",
  currentLabel = "HR Executive edits",
  subjectPlaceholder = "Memo subject",
  bodyPlaceholder = "Edit the memo body before signing.",
  bodyLabel = "Memo body",
  ccLabel = "CC list",
  ccPlaceholder = "Add any other people to copy",
  fixedCcRecipients = [],
  bodyRows = 8,
}: TrackedMemoEditorProps) {
  const [mode, setMode] = useState<"edit" | "changes">("edit")
  const fixedCcText = fixedCcRecipients.map((recipient) => recipient.trim()).filter(Boolean).join("\n")
  const originalCcForDiff = [fixedCcText, originalCc].filter(Boolean).join("\n")
  const currentCcForDiff = [fixedCcText, cc].filter(Boolean).join("\n")
  const fields = useMemo(
    () =>
      buildMemoFieldChanges({
        originalSubject,
        originalBody,
        originalCc: originalCcForDiff,
        subject,
        body,
        cc: currentCcForDiff,
        includeCc: showCc,
      }),
    [originalSubject, originalBody, originalCcForDiff, subject, body, currentCcForDiff, showCc],
  )
  const changedCount = fields.filter((field) => field.changed).length
  const editCounts = fields.reduce(
    (acc, field) => {
      const counts = countMemoEdits(field.tokens)
      acc.added += counts.added
      acc.removed += counts.removed
      return acc
    },
    { added: 0, removed: 0 },
  )

  const resetToOriginal = () => {
    onSubjectChange?.(String(originalSubject || ""))
    onBodyChange?.(String(originalBody || ""))
    if (showCc) onCcChange?.(String(originalCc || ""))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{title}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {changedCount === 0
              ? `No changes from the ${originalLabel.toLowerCase()}.`
              : `${changedCount} field${changedCount === 1 ? "" : "s"} changed · ${editCounts.added} added · ${editCounts.removed} removed`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium ${mode === "edit" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <FilePenLine className="h-3 w-3" />
              {readOnly ? "Current" : "Edit"}
            </button>
            <button
              type="button"
              onClick={() => setMode("changes")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium ${mode === "changes" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <Eye className="h-3 w-3" />
              Track changes
            </button>
          </div>
          {!readOnly && (
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={resetToOriginal}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Restore original
            </Button>
          )}
        </div>
      </div>

      {mode === "edit" ? (
        <div className="space-y-3 p-4">
          <div className="space-y-1">
            <Label className="text-xs">{readOnly ? "Subject" : "Memo subject"}</Label>
            <Input
              value={subject}
              onChange={(event) => onSubjectChange?.(event.target.value)}
              placeholder={subjectPlaceholder}
              readOnly={readOnly}
              className="h-9 bg-white"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{readOnly ? bodyLabel : bodyLabel}</Label>
            <Textarea
              value={body}
              onChange={(event) => onBodyChange?.(event.target.value)}
              placeholder={bodyPlaceholder}
              rows={bodyRows}
              readOnly={readOnly}
              className="resize-y text-sm bg-white leading-6"
            />
          </div>
          {showCc && (
            <div className="space-y-2">
              {fixedCcText && (
                <>
                  <Label className="text-xs">Permanent CC list</Label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 whitespace-pre-line">
                    {fixedCcText}
                  </div>
                </>
              )}
              <Label className="text-xs">{ccLabel} <span className="font-normal text-slate-400">(optional, one per line)</span></Label>
              <Textarea
                value={cc}
                onChange={(event) => onCcChange?.(event.target.value)}
                placeholder={ccPlaceholder}
                rows={3}
                readOnly={readOnly}
                className="resize-none text-sm bg-white"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{originalLabel}</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Added by {currentLabel}</span>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">Removed from original</span>
          </div>
          {fields.map((field) => (
            <div key={field.field} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">{field.label}</p>
                <span className={`text-[10px] font-medium ${field.changed ? "text-amber-700" : "text-slate-400"}`}>
                  {field.changed ? "Edited" : "Unchanged"}
                </span>
              </div>
              <DiffPreview tokens={field.tokens} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

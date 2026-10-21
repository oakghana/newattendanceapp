"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCheck, ChevronLeft, ChevronRight, Eye, FileText, Megaphone, Pencil, Quote, RefreshCw, Send, ShieldCheck, Trash2, Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

  const AUDIENCES = [
    ["", "All Staff / All Roles"],
  ["department_head", "Department Heads only"],
  ["regional_manager", "Regional Managers only"],
  ["department_head_and_regional_manager", "Department Heads + Regional Managers"],
    ["regional_hr_office", "Regional HR Office only"],
  ] as const

type Circular = {
  id: string
  title: string
  commentary: string | null
  file_url: string
  file_name: string
  mime_type: string
  is_downloadable: boolean
  audience_roles?: string[]
  published_at: string
  publisher_name?: string
  publisher_role?: string
  publisher_position?: string
}

type Period = "week" | "month" | "quarter" | "year"

export function ECircularsPortal() {
  const { toast } = useToast()
  const [items, setItems] = useState<Circular[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [period, setPeriod] = useState<Period>("month")
  const [page, setPage] = useState(1)
  const [canPublish, setCanPublish] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [canAnalytics, setCanAnalytics] = useState(false)
  const [analytics, setAnalytics] = useState<{ totalReads: number; uniqueReaders: number; totalStaff: number; readingRate: number; unreadReaders: number; repeatOpens: number; averageOpens: number; totalDownloads: number; uniqueDownloaders: number; downloadRate: number; byLocation: { label: string; count: number }[]; byRank: { label: string; count: number }[]; circularPerformance: { title: string; readers: number; readingRate: number; downloads: number; downloaders: number; publishedAt: string }[] } | null>(null)
  const [activeTab, setActiveTab] = useState<"read" | "publish">("read")
  const [title, setTitle] = useState("")
  const [commentary, setCommentary] = useState("")
  const [audience, setAudience] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [isDownloadable, setIsDownloadable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshingAnalytics, setRefreshingAnalytics] = useState(false)
  const [selectedCircular, setSelectedCircular] = useState<Circular | null>(null)

  const load = async () => {
    const response = await fetch("/api/e-circulars", { cache: "no-store" })
    const data = await response.json()
    if (!response.ok) {
      toast({ title: "Unable to load circulars", description: data.error ?? "Please try again.", variant: "destructive" })
      return
    }
    const nextItems = data.circulars ?? []
    const nextReadIds = new Set<string>(data.readCircularIds ?? [])
    setItems(nextItems)
    setReadIds(nextReadIds)
    const unreadCount = nextItems.filter((item: Circular) => !nextReadIds.has(item.id)).length
    if (unreadCount > 0) toast({ title: `${unreadCount} new circular${unreadCount === 1 ? "" : "s"}`, description: "New official communication is available for your attention." })
    setCanPublish(Boolean(data.canPublish))
    setCanManage(Boolean(data.canManage))
    setCanAnalytics(Boolean(data.canViewAnalytics))
  }

  useEffect(() => {
  void load()
  }, [])

  const refreshAnalytics = async () => {
    setRefreshingAnalytics(true)
    try {
      const response = await fetch("/api/e-circulars/analytics", { cache: "no-store" })
      if (!response.ok) throw new Error("Unable to refresh analytics")
      const data = await response.json()
      setAnalytics(data.summary || null)
    } finally {
      setRefreshingAnalytics(false)
    }
  }

  useEffect(() => {
    if (!canAnalytics) return
    void refreshAnalytics()
  }, [canAnalytics])

  const qccWeekLabel = (date: Date) => {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
    const mondayOffset = (monthStart.getDay() + 6) % 7
    return `Week ${Math.floor((date.getDate() + mondayOffset - 1) / 7) + 1}`
  }

  const groupedItems = useMemo(() => {
    const groups = new Map<string, Circular[]>()
    for (const item of items) {
      const date = new Date(item.published_at)
      const year = date.getFullYear()
      const month = date.toLocaleString("en", { month: "long" })
      const quarter = `Q${Math.floor(date.getMonth() / 3) + 1} ${year}`
      const week = new Date(date)
      week.setDate(date.getDate() - date.getDay())
      const label = period === "week" ? `Week of ${week.toLocaleDateString()}` : period === "month" ? `${month} ${year}` : period === "quarter" ? quarter : String(year)
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label)?.push(item)
    }
    return Array.from(groups.entries())
  }, [items, period])
  const pageSize = 6
  const pageCount = Math.max(1, Math.ceil(groupedItems.length / pageSize))
  const visibleGroups = groupedItems.slice((page - 1) * pageSize, page * pageSize)

  const publish = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) {
      toast({ title: "Circular file required", description: "Attach a PDF or image before publishing.", variant: "destructive" })
      return
    }
    setBusy(true)
    const body = new FormData()
    body.append("title", title)
    body.append("commentary", commentary)
    body.append("audienceRoles", JSON.stringify(audience ? [audience] : []))
    body.append("isDownloadable", String(isDownloadable))
    body.append("file", file)
    const response = await fetch("/api/e-circulars", { method: "POST", body })
    const data = await response.json()
    setBusy(false)
    if (!response.ok) {
      toast({ title: "Publishing failed", description: data.error ?? "The circular could not be published.", variant: "destructive" })
      return
    }
    setTitle("")
    setCommentary("")
    setAudience("")
    setIsDownloadable(false)
    setFile(null)
    const fileInput = document.getElementById("circular-file") as HTMLInputElement | null
    if (fileInput) fileInput.value = ""
    toast({ title: "Circular published", description: "The circular is now available to its selected audience." })
    await load()
    setActiveTab("read")
  }

  const editCircular = async (item: Circular) => {
    const nextTitle = window.prompt("Edit circular title", item.title)
    if (!nextTitle?.trim()) return
    const nextCommentary = window.prompt("Edit reader commentary", item.commentary || "")
    const body = new FormData()
    body.append("id", item.id)
    body.append("title", nextTitle.trim())
    body.append("commentary", nextCommentary?.trim() || "")
    body.append("audienceRoles", JSON.stringify(item.audience_roles || []))
    body.append("isDownloadable", String(item.is_downloadable))
    const response = await fetch("/api/e-circulars", { method: "PUT", body })
    const data = await response.json()
    if (!response.ok) {
      toast({ title: "Unable to update circular", description: data.error || "Please try again.", variant: "destructive" })
      return
    }
    toast({ title: "Circular updated", description: "The updated notice is now visible to its selected audience." })
    await load()
  }

  const deleteCircular = async (item: Circular) => {
    if (!window.confirm(`Delete \\"${item.title}\\"? It will disappear from every dashboard.`)) return
    const response = await fetch("/api/e-circulars", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) })
    const data = await response.json()
    if (!response.ok) {
      toast({ title: "Unable to delete circular", description: data.error || "Please try again.", variant: "destructive" })
      return
    }
    setItems((current) => current.filter((circular) => circular.id !== item.id))
    toast({ title: "Circular deleted", description: "The circular has been removed from all dashboards." })
  }

  const openCircular = async (item: Circular) => {
    await fetch("/api/e-circulars/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ circularId: item.id }),
    })
    setReadIds((current) => new Set(current).add(item.id))
    setSelectedCircular(item)
  }

  const downloadCircular = async (item: Circular) => {
    try {
      const response = await fetch(item.file_url)
      if (!response.ok) throw new Error("Download request failed")
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = item.file_name || `${item.title}.${item.mime_type === "application/pdf" ? "pdf" : "png"}`
      anchor.style.display = "none"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      await fetch("/api/e-circulars/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ circularId: item.id }) })
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      toast({ title: "Download failed", description: "The circular could not be downloaded. Please try again.", variant: "destructive" })
    }
  }

  const previewText = (commentary: string | null) => {
    const words = (commentary || "Please review the official circular for full details.").trim().split(/\\s+/).slice(0, 4)
    return `${words.join(" ")}...`
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">Official communications</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Electronic Circulars</h1>
            <p className="mt-2 max-w-2xl text-slate-400">📢 Please take a moment to read QCC&apos;s official notices here. Where download options are available, staff may also download the attached documents for future reference. Thank you for staying informed and updated.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Read access is recorded</div>
        </header>

        <div className="flex gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2">
          <Button type="button" onClick={() => setActiveTab("read")} className={activeTab === "read" ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : "bg-transparent text-slate-300 hover:bg-slate-800"}>
            <Eye className="mr-2 h-4 w-4" /> All Circulars
          </Button>
          {canPublish && <Button type="button" onClick={() => setActiveTab("publish")} className={activeTab === "publish" ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : "bg-transparent text-slate-300 hover:bg-slate-800"}>
            <Megaphone className="mr-2 h-4 w-4" /> Post Circular
          </Button>}
        </div>

        {activeTab === "read" ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:flex-row md:items-center md:justify-between"><div><h2 className="text-xl font-semibold">Circular archive</h2><p className="mt-1 text-sm text-slate-400">Browse notices by publication period.</p></div><div className="flex flex-wrap gap-2">{([['week','Weekly'],['month','Monthly'],['quarter','Quarterly'],['year','Yearly']] as [Period,string][]).map(([value,label]) => <Button key={value} size="sm" onClick={() => { setPeriod(value); setPage(1) }} className={period === value ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}>{label}</Button>)}</div></div>
            <div className="flex items-center justify-between text-sm text-slate-400"><span>{items.length} published circulars</span><span>Page {page} of {pageCount}</span></div>
            {visibleGroups.map(([label, group]) => <div key={label} className="space-y-3"><div className="flex items-center gap-3"><span className="h-px flex-1 bg-slate-800" /><h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-400">{label}</h3><span className="h-px flex-1 bg-slate-800" /></div>{group.map((item) => { const isRead = readIds.has(item.id); return <Card key={item.id} className={`border-slate-800 bg-slate-900 text-slate-100 ${isRead ? "opacity-80" : "ring-1 ring-cyan-400/20"}`}><CardContent className="flex flex-col justify-between gap-5 p-5 md:flex-row"><div className="flex gap-4"><div className={`rounded-xl p-3 ${isRead ? "bg-emerald-400/10 text-emerald-400" : "bg-cyan-400/10 text-cyan-400"}`}>{isRead ? <CheckCheck /> : <FileText />}</div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.title}</h3>{isRead && <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-300">Read</span>}</div><div className="mt-3 flex gap-2 border-l-2 border-cyan-400/60 pl-3 text-sm leading-6 text-slate-300"><Quote className="mt-1 h-4 w-4 shrink-0 text-cyan-400" /><p>{previewText(item.commentary)}</p></div><p className="mt-3 text-xs text-slate-500">Published {new Date(item.published_at).toLocaleDateString()} · {qccWeekLabel(new Date(item.published_at))} · Source: Registry{canManage && <> · Uploaded by {item.publisher_name || "HR Records"} ({item.publisher_position || "HR Records"})</>}</p></div></div><div className="flex shrink-0 flex-wrap gap-2"><Button onClick={() => void openCircular(item)} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"><Eye className="mr-2 h-4 w-4" />{isRead ? "Read again" : "Open notice"}</Button>{item.is_downloadable && <Button type="button" onClick={() => void downloadCircular(item)} variant="outline" className="border-emerald-500/40 bg-transparent text-emerald-300 hover:bg-emerald-500/10">Download</Button>}{canManage && <><Button size="sm" variant="outline" onClick={() => void editCircular(item)} className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800" aria-label={`Edit ${item.title}`}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => void deleteCircular(item)} className="border-red-500/30 bg-transparent text-red-300 hover:bg-red-500/10" aria-label={`Delete ${item.title}`}><Trash2 className="h-4 w-4" /></Button></>}</div></CardContent></Card>})}</div>)}
            {!items.length && <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-400">No circulars have been published for your role.</div>}
            {items.length > 0 && <div className="flex items-center justify-center gap-3 pt-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="border-slate-700 bg-transparent text-slate-300"><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><span className="text-sm text-slate-400">{page} / {pageCount}</span><Button size="sm" variant="outline" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)} className="border-slate-700 bg-transparent text-slate-300">Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div>}
            {canAnalytics && analytics && <Card className="border-cyan-900 bg-slate-900 text-slate-100"><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-cyan-400" /> Readership analytics</CardTitle><p className="mt-1 text-sm text-slate-400">Measure reach, follow-up needs, repeat engagement, and where circulars are being read.</p></div><Button type="button" size="sm" variant="outline" onClick={() => void refreshAnalytics()} disabled={refreshingAnalytics} className="shrink-0 border-cyan-400/40 bg-transparent text-cyan-300 hover:bg-cyan-400/10"><RefreshCw className={`mr-2 h-4 w-4 ${refreshingAnalytics ? "animate-spin" : ""}`} />{refreshingAnalytics ? "Refreshing" : "Refresh metrics"}</Button></div></CardHeader><CardContent className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Reading rate</p><p className="mt-1 text-3xl font-semibold text-cyan-300">{analytics.readingRate}%</p><p className="mt-1 text-xs text-slate-500">{analytics.uniqueReaders} of {analytics.totalStaff} staff</p></div><div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Needs follow-up</p><p className="mt-1 text-3xl font-semibold text-amber-300">{analytics.unreadReaders}</p><p className="mt-1 text-xs text-slate-500">Staff with no recorded read</p></div><div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Repeat opens</p><p className="mt-1 text-3xl font-semibold text-emerald-300">{analytics.repeatOpens}</p><p className="mt-1 text-xs text-slate-500">Readers who reopened notices</p></div><div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Average opens</p><p className="mt-1 text-3xl font-semibold text-violet-300">{analytics.averageOpens}</p><p className="mt-1 text-xs text-slate-500">Opens per unique reader</p></div><div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Downloads</p><p className="mt-1 text-3xl font-semibold text-emerald-300">{analytics.totalDownloads}</p><p className="mt-1 text-xs text-slate-500">{analytics.uniqueDownloaders} unique downloaders · {analytics.downloadRate}% of readers</p></div></div><div className="grid gap-5 lg:grid-cols-3"><div><h3 className="mb-2 text-sm font-semibold text-slate-300">By location</h3><div className="space-y-2">{analytics.byLocation.slice(0, 8).map((row) => <div key={row.label} className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2 text-sm"><span className="truncate text-slate-400">{row.label}</span><span className="ml-3 rounded-full bg-cyan-400/15 px-2 py-0.5 font-semibold text-cyan-300">{row.count}</span></div>)}</div></div><div><h3 className="mb-2 text-sm font-semibold text-slate-300">By rank / position</h3><div className="space-y-2">{analytics.byRank.slice(0, 8).map((row) => <div key={row.label} className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2 text-sm"><span className="truncate text-slate-400">{row.label}</span><span className="ml-3 rounded-full bg-cyan-400/15 px-2 py-0.5 font-semibold text-cyan-300">{row.count}</span></div>)}</div></div><div><h3 className="mb-2 text-sm font-semibold text-slate-300">Circular performance</h3><div className="space-y-2">{analytics.circularPerformance.slice(0, 5).map((row) => <div key={`${row.title}-${row.publishedAt}`} className="rounded-lg bg-slate-950/60 px-3 py-2 text-sm"><div className="flex items-center justify-between gap-2"><span className="truncate text-slate-400">{row.title}</span><span className="font-semibold text-emerald-300">{row.readingRate}%</span></div><p className="mt-1 text-xs text-slate-500">{row.readers} readers · {row.downloads} downloads · {row.downloaders} downloaders</p></div>)}</div></div></div></CardContent></Card>}
          </section>
        ) : (
          <Card className="max-w-2xl border-cyan-900 bg-slate-900 text-slate-100"><CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-cyan-400" /> Post a circular</CardTitle><p className="text-sm text-slate-400">Share a clear, official notice with the right audience.</p></CardHeader><CardContent><form onSubmit={publish} className="space-y-5"><div><Label htmlFor="circular-title">Title</Label><Input id="circular-title" value={title} onChange={(event) => setTitle(event.target.value)} required className="mt-1 border-slate-700 bg-slate-950" placeholder="Circular subject" /></div><div><Label htmlFor="circular-commentary">Commentary for readers</Label><Textarea id="circular-commentary" value={commentary} onChange={(event) => setCommentary(event.target.value)} className="mt-1 border-slate-700 bg-slate-950" placeholder="Briefly explain what staff should know or do." /></div><div><Label htmlFor="circular-audience">Audience</Label><select id="circular-audience" value={audience} onChange={(event) => setAudience(event.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-sm">{AUDIENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><Label htmlFor="circular-file">PDF or image</Label><Input id="circular-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required className="mt-1 border-slate-700 bg-slate-950" /></div><label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300"><input type="checkbox" checked={isDownloadable} onChange={(event) => setIsDownloadable(event.target.checked)} className="mt-1 h-4 w-4 accent-cyan-500" /><span><span className="font-medium text-slate-100">Allow readers to download</span><span className="mt-1 block text-xs text-slate-500">When disabled, staff can only open and read the circular online.</span></span></label><Button disabled={busy} className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400"><Upload className="mr-2 h-4 w-4" />{busy ? "Publishing..." : "Publish circular"}</Button></form></CardContent></Card>
        )}
        {selectedCircular && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="circular-reader-title">
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-cyan-400/30 bg-slate-900 shadow-2xl shadow-cyan-950/50">
              <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Source: Registry</p><h2 id="circular-reader-title" className="truncate text-lg font-semibold text-slate-100">{selectedCircular.title}</h2></div>
                <Button type="button" variant="outline" onClick={() => setSelectedCircular(null)} className="shrink-0 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white">Close</Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-slate-950 p-3 sm:p-6">
                {selectedCircular.mime_type === "application/pdf" ? <iframe src={selectedCircular.file_url} title={selectedCircular.title} className="h-[70vh] min-h-[420px] w-full rounded-xl border border-slate-800 bg-white" /> : <img src={selectedCircular.file_url} alt={`Full official circular: ${selectedCircular.title}`} className="mx-auto block h-auto max-h-[75vh] w-auto max-w-full rounded-xl object-contain" />}
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-slate-400">{selectedCircular.commentary || "Please review this official circular for full details."}</p>{selectedCircular.is_downloadable && <Button type="button" onClick={() => void downloadCircular(selectedCircular)} variant="outline" className="shrink-0 border-emerald-500/40 bg-transparent text-emerald-300 hover:bg-emerald-500/10">Download</Button>}</div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

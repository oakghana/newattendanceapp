"use client"

import { useEffect, useState } from "react"
import { Eye, FileText, Megaphone, Quote, Send, ShieldCheck, Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const AUDIENCES = [
  ["", "All roles"],
  ["department_head", "HODs only"],
  ["regional_manager", "Regional Managers only"],
  ["managing_director", "Managing Director only"],
  ["hr_records", "HR Records only"],
] as const

type Circular = {
  id: string
  title: string
  commentary: string | null
  file_url: string
  file_name: string
  published_at: string
}

export function ECircularsPortal() {
  const { toast } = useToast()
  const [items, setItems] = useState<Circular[]>([])
  const [canPublish, setCanPublish] = useState(false)
  const [canAnalytics, setCanAnalytics] = useState(false)
  const [activeTab, setActiveTab] = useState<"read" | "publish">("read")
  const [title, setTitle] = useState("")
  const [commentary, setCommentary] = useState("")
  const [audience, setAudience] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const response = await fetch("/api/e-circulars", { cache: "no-store" })
    const data = await response.json()
    if (!response.ok) {
      toast({ title: "Unable to load circulars", description: data.error ?? "Please try again.", variant: "destructive" })
      return
    }
    setItems(data.circulars ?? [])
    setCanPublish(Boolean(data.canPublish))
    setCanAnalytics(Boolean(data.canViewAnalytics))
  }

  useEffect(() => {
    void load()
  }, [])

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
    setFile(null)
    const fileInput = document.getElementById("circular-file") as HTMLInputElement | null
    if (fileInput) fileInput.value = ""
    toast({ title: "Circular published", description: "The circular is now available to its selected audience." })
    await load()
    setActiveTab("read")
  }

  const openCircular = async (item: Circular) => {
    await fetch("/api/e-circulars/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ circularId: item.id }),
    })
    window.open(item.file_url, "_blank", "noopener,noreferrer")
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">Official communications</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Electronic Circulars</h1>
            <p className="mt-2 max-w-2xl text-slate-400">Read official notices from the organisation. Your access is recorded for accountability.</p>
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
            <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Latest circulars</h2><p className="mt-1 text-sm text-slate-400">Please read each notice carefully.</p></div><span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">{items.length} published</span></div>
            {items.map((item) => <Card key={item.id} className="border-slate-800 bg-slate-900 text-slate-100"><CardContent className="flex flex-col justify-between gap-5 p-5 md:flex-row"><div className="flex gap-4"><div className="rounded-xl bg-cyan-400/10 p-3 text-cyan-400"><FileText /></div><div><h3 className="font-semibold">{item.title}</h3><div className="mt-3 flex gap-2 border-l-2 border-cyan-400/60 pl-3 text-sm leading-6 text-slate-300"><Quote className="mt-1 h-4 w-4 shrink-0 text-cyan-400" /><p>{item.commentary || "Please review the attached official circular for full details."}</p></div><p className="mt-3 text-xs text-slate-500">Published {new Date(item.published_at).toLocaleDateString()} · {item.file_name}</p></div></div><Button onClick={() => void openCircular(item)} className="shrink-0 bg-cyan-500 text-slate-950 hover:bg-cyan-400"><Eye className="mr-2 h-4 w-4" />Open notice</Button></CardContent></Card>)}
            {!items.length && <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-400">No circulars have been published for your role.</div>}
            {canAnalytics && <p className="text-sm text-slate-500">Read analytics are available to your role.</p>}
          </section>
        ) : (
          <Card className="max-w-2xl border-cyan-900 bg-slate-900 text-slate-100"><CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-cyan-400" /> Post a circular</CardTitle><p className="text-sm text-slate-400">Share a clear, official notice with the right audience.</p></CardHeader><CardContent><form onSubmit={publish} className="space-y-5"><div><Label htmlFor="circular-title">Title</Label><Input id="circular-title" value={title} onChange={(event) => setTitle(event.target.value)} required className="mt-1 border-slate-700 bg-slate-950" placeholder="Circular subject" /></div><div><Label htmlFor="circular-commentary">Commentary for readers</Label><Textarea id="circular-commentary" value={commentary} onChange={(event) => setCommentary(event.target.value)} className="mt-1 border-slate-700 bg-slate-950" placeholder="Briefly explain what staff should know or do." /></div><div><Label htmlFor="circular-audience">Audience</Label><select id="circular-audience" value={audience} onChange={(event) => setAudience(event.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-sm">{AUDIENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><Label htmlFor="circular-file">PDF or image</Label><Input id="circular-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required className="mt-1 border-slate-700 bg-slate-950" /></div><Button disabled={busy} className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400"><Upload className="mr-2 h-4 w-4" />{busy ? "Publishing..." : "Publish circular"}</Button></form></CardContent></Card>
        )}
      </div>
    </main>
  )
}

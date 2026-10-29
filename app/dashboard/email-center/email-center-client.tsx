"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, Eye, History, Palette, RefreshCw, Save, Send, ShieldCheck, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const logoUrl = "/logos/qcc-logo.png"
const portalLoginUrl = "https://updates.qccapps.com/auth/login"
const presets = {
  announcement: { label: "Formal staff announcement", subject: "Important update from QCC Portal", title: "Important update from QCC Portal", accent: "#117a6b", message: "We are writing to share an important update with you. Please sign in to the portal to review the details and any action required." },
  reminder: { label: "Action required reminder", subject: "Action required: please review your pending request", title: "Action required on your pending request", accent: "#b45309", message: "A request is waiting for your attention. Please sign in to the portal and complete the required review." },
  appreciation: { label: "Formal appreciation", subject: "Thank you from QCC Portal", title: "Thank you for your contribution", accent: "#1d4ed8", message: "Thank you for your continued service and contribution to QCC. We appreciate your commitment to the organization." },
}
const audienceOptions = [
  { value: "all", label: "All active staff", description: "Everyone with an active account and email" },
  { value: "staff", label: "General staff", description: "Staff, NSP, interns, and contract staff" },
  { value: "leadership", label: "Department and regional leaders", description: "Department heads and regional managers" },
  { value: "hr_accounts", label: "HR and Accounts", description: "HR, leave, and accounts teams" },
  { value: "operations", label: "Operations teams", description: "Transport, audit, and IT teams" },
  { value: "administrators", label: "Administrators", description: "System administrators only" },
]

function buildEmailHtml(title: string, message: string, accent: string, ctaLabel: string) {
  return `<div style="margin:0;background:#eef6f5;padding:32px;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #d8e9e6"><div style="background:${accent};padding:26px 30px;color:#fff"><img src="${logoUrl}" alt="QCC logo" width="48" height="48" style="display:block;border-radius:10px;margin-bottom:18px"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.85">QCC Portal</div><h1 style="margin:12px 0 0;font-size:28px;line-height:1.2">${title}</h1></div><div style="padding:32px;color:#17333a"><p style="font-size:16px;line-height:1.7;white-space:pre-line">${message}</p><a href="${portalLoginUrl}" style="display:inline-block;margin-top:14px;background:${accent};color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:700">${ctaLabel}</a></div><div style="background:#f7fbfa;padding:20px 30px;color:#6a7d80;font-size:12px;line-height:1.6">QCC MANAGEMENT</div></div></div>`
}

export default function EmailCenterClient() {
  const [templates, setTemplates] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [broadcastSubject, setBroadcastSubject] = useState(presets.announcement.subject)
  const [templateSubject, setTemplateSubject] = useState("")
  const [broadcastTitle, setBroadcastTitle] = useState(presets.announcement.title)
  const [broadcastMessage, setBroadcastMessage] = useState(presets.announcement.message)
  const [broadcastAccent, setBroadcastAccent] = useState(presets.announcement.accent)
  const [ctaLabel, setCtaLabel] = useState("Open the QCC portal")
  const [templateMessage, setTemplateMessage] = useState("")
  const [templateAccent, setTemplateAccent] = useState("#117a6b")
  const [templateCta, setTemplateCta] = useState("Open request in portal")
  const [tab, setTab] = useState("compose")
  const [historyFilter, setHistoryFilter] = useState("all")
  const [message, setMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [audience, setAudience] = useState(["all"])
  const [manualRecipients, setManualRecipients] = useState("")
  const [ccRecipients, setCcRecipients] = useState("")
  const [recipientMode, setRecipientMode] = useState<"categories" | "manual">("categories")
  const [historyPage, setHistoryPage] = useState(1)
  const HISTORY_PAGE_SIZE = 25

  const filteredLogs = useMemo(() => historyFilter === "all" ? logs : logs.filter((log) => log.status === historyFilter), [historyFilter, logs])
  function changeHistoryFilter(value: string) { setHistoryFilter(value); setHistoryPage(1) }
  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / HISTORY_PAGE_SIZE))
  const visibleLogs = filteredLogs.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE)
  const sentCount = logs.filter((log) => log.status === "sent").length
  const failedCount = logs.filter((log) => log.status === "failed").length
  const previewHtml = buildEmailHtml(broadcastTitle, broadcastMessage, broadcastAccent, ctaLabel)

  async function load() {
    const [templateResponse, logResponse] = await Promise.all([fetch("/api/admin/email-center?view=templates"), fetch("/api/admin/email-center")])
    if (templateResponse.status === 401 || logResponse.status === 401) { window.location.href = "/auth/login"; return }
    if (templateResponse.status === 403 || logResponse.status === 403) { setAccessDenied(true); return }
    const templateData = await templateResponse.json(); const logData = await logResponse.json()
    setTemplates(templateData.templates || []); setLogs(logData.logs || [])
    if (!selected && templateData.templates?.[0]) selectTemplate(templateData.templates[0])
  }
  function selectTemplate(template: any) {
    setSelected(template); setTemplateSubject(template.subject); setTemplateAccent(template.accent_color || "#117a6b")
    setTemplateMessage(template.html_body.match(/<p>(.*?)<\/p>/)?.[1] || "Your request requires your attention in the QCC portal.")
  }
  function applyPreset(key: keyof typeof presets) {
    const preset = presets[key]; setBroadcastSubject(preset.subject); setBroadcastTitle(preset.title); setBroadcastAccent(preset.accent); setBroadcastMessage(preset.message)
  }
  useEffect(() => { load() }, [])

  async function saveTemplate() {
    if (!selected) return
    const html = buildEmailHtml(selected.name, templateMessage, templateAccent, templateCta)
    const response = await fetch("/api/admin/email-center", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, subject: templateSubject, html_body: html, text_body: templateMessage, accent_color: templateAccent, is_active: selected.is_active }) })
    setMessage(response.ok ? "Template saved. Future alerts will use this design." : "Unable to save template."); await load()
  }
  async function retryAlert(logId: string) {
    setRetryingId(logId)
    setMessage("")
    try {
      const response = await fetch("/api/admin/email-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retryLogId: logId }) })
      const data = await response.json()
      setMessage(response.ok && data.success ? "Alert retry submitted." : data.error || "Unable to retry this alert.")
      if (response.ok) await load()
    } finally {
      setRetryingId(null)
    }
  }

  async function deleteHistory() {
    if (!window.confirm("Delete all email delivery history? This cannot be undone.")) return
    const response = await fetch("/api/admin/email-center", { method: "DELETE" })
    const data = await response.json()
    setMessage(response.ok ? "Email delivery history deleted." : data.error || "Unable to delete email history.")
    if (response.ok) { setLogs([]); setHistoryPage(1) }
  }

  async function sendEmail() {
    setMessage("")
    if ((recipientMode === "categories" && !audience.length) || (recipientMode === "manual" && !manualRecipients.trim()) || !broadcastSubject.trim() || !broadcastMessage.trim()) {
      setMessage(recipientMode === "manual" ? "Add at least one valid To email, a subject, and a message before sending." : "Choose at least one staff category, a subject, and a message before sending.")
      return
    }
    setIsSending(true)
    try {
      const html = buildEmailHtml(broadcastTitle, broadcastMessage, broadcastAccent, ctaLabel)
      const response = await fetch("/api/admin/email-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audienceRoles: recipientMode === "categories" ? audience : [], recipients: recipientMode === "manual" ? manualRecipients.split(/[,\n]/) : [], cc: ccRecipients.split(/[,\n]/), subject: broadcastSubject.trim(), html, text: broadcastMessage }) })
      const data = await response.json()
      setMessage(response.ok && data.success ? `Broadcast sent to ${data.sentCount || 0} staff member${data.sentCount === 1 ? "" : "s"} and recorded in history.` : data.error || `Broadcast completed with ${data.failedCount || "some"} failure(s). Open Delivery history for details.`)
      await load()
      setTab("history")
    } catch {
      setMessage("The broadcast could not be completed. Check Delivery history and try again.")
    } finally {
      setIsSending(false)
    }
  }

  if (accessDenied) return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100"><section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-950 text-teal-300"><ShieldCheck className="h-7 w-7" /></div><h1 className="mt-5 text-2xl font-bold">Administrator access required</h1><p className="mt-3 text-slate-400">The Email Center is restricted to authorized administrators. Your session does not have permission to view it.</p><Button className="mt-6 bg-teal-600 hover:bg-teal-500" onClick={() => { window.location.href = "/dashboard" }}>Return to dashboard</Button></section></main>

  return <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-6 rounded-3xl bg-gradient-to-br from-teal-900 via-slate-900 to-slate-950 p-7 shadow-2xl md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-4"><div className="rounded-2xl bg-white p-2"><img src={logoUrl} alt="QCC logo" className="h-12 w-12 rounded-xl object-contain" /></div><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-teal-300">Administrator tools</p><h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Email center</h1><p className="mt-2 max-w-2xl text-slate-300">Send formal staff communications, edit alert designs without writing HTML, and monitor provider acceptance and failures.</p></div></div><div className="flex items-center gap-3 rounded-2xl border border-teal-700/50 bg-teal-950/50 px-5 py-4 text-sm text-teal-100"><ShieldCheck className="h-5 w-5 text-teal-300" /><span><strong className="block">Admin only</strong>Resend delivery is active</span></div></header>
    {message && <div className="rounded-xl border border-teal-700 bg-teal-950/60 px-4 py-3 text-teal-100">{message}</div>}
    <div className="grid gap-4 md:grid-cols-3"><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardContent className="flex items-center gap-4 p-5"><CheckCircle2 className="h-8 w-8 text-emerald-400" /><div><p className="text-sm text-slate-400">Accepted by provider</p><p className="text-2xl font-bold">{sentCount}</p></div></CardContent></Card><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardContent className="flex items-center gap-4 p-5"><AlertCircle className="h-8 w-8 text-red-400" /><div><p className="text-sm text-slate-400">Failed</p><p className="text-2xl font-bold">{failedCount}</p></div></CardContent></Card><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardContent className="flex items-center gap-4 p-5"><Users className="h-8 w-8 text-teal-300" /><div><p className="text-sm text-slate-400">Tracked messages</p><p className="text-2xl font-bold">{logs.length}</p></div></CardContent></Card></div>
    <Tabs value={tab} onValueChange={setTab} className="space-y-6"><TabsList className="bg-slate-900"><TabsTrigger value="compose"><Send className="mr-2 h-4 w-4" />Broadcast</TabsTrigger><TabsTrigger value="manual"><Send className="mr-2 h-4 w-4" />Manual email</TabsTrigger><TabsTrigger value="templates"><Palette className="mr-2 h-4 w-4" />Alert templates</TabsTrigger><TabsTrigger value="history"><History className="mr-2 h-4 w-4" />Delivery history</TabsTrigger></TabsList>
      <TabsContent value="manual"><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle>Manual email</CardTitle><p className="text-sm text-slate-400">Send a one-off email to specific addresses without selecting a staff category.</p></CardHeader><CardContent><Button type="button" className="bg-teal-600 hover:bg-teal-500" onClick={() => { setRecipientMode("manual"); setTab("compose") }}><Send className="mr-2 h-4 w-4" />Open manual composer</Button><p className="mt-3 text-sm text-slate-400">The manual composer supports multiple To addresses and optional CC addresses separated by commas or new lines.</p></CardContent></Card></TabsContent><TabsContent value="compose"><div className="grid gap-6 lg:grid-cols-[1fr_420px]"><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle>Formal staff broadcast</CardTitle><p className="text-sm text-slate-400">Choose a starting format, then personalize the message. No HTML knowledge is required.</p></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 sm:grid-cols-3">{Object.entries(presets).map(([key, preset]) => <button key={key} onClick={() => applyPreset(key as keyof typeof presets)} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-left text-sm hover:border-teal-500"><span className="font-semibold">{preset.label}</span><span className="mt-1 block text-xs text-slate-400">Use formal QCC format</span></button>)}</div><div className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setRecipientMode("categories"); setMessage("") }} className={`rounded-lg px-4 py-2 font-semibold ${recipientMode === "categories" ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-300"}`}>App categories</button><button type="button" onClick={() => { setRecipientMode("manual"); setMessage("") }} className={`rounded-lg px-4 py-2 font-semibold ${recipientMode === "manual" ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-300"}`}>Manual recipients</button></div>{recipientMode === "manual" && <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="block font-medium">To addresses<Textarea value={manualRecipients} onChange={(event) => { setManualRecipients(event.target.value); setMessage("") }} placeholder="person@example.com, another@example.com" className="mt-2 min-h-24 border-slate-700 bg-slate-900" /><span className="mt-1 block text-xs text-slate-400">Separate multiple addresses with commas or new lines.</span></label><label className="block font-medium">CC addresses <span className="font-normal text-slate-400">(optional)</span><Textarea value={ccRecipients} onChange={(event) => { setCcRecipients(event.target.value); setMessage("") }} placeholder="manager@example.com" className="mt-2 min-h-24 border-slate-700 bg-slate-900" /><span className="mt-1 block text-xs text-slate-400">CC recipients receive a visible copy.</span></label></div>}</div>{recipientMode === "categories" && <div className="rounded-xl border border-teal-700/60 bg-teal-950/40 p-4 text-sm text-teal-100"><div className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4" />Choose who should receive this email</div><p className="mt-1 text-teal-200/80">Select one or more staff categories. Recipients are resolved securely from active accounts on the server.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{audienceOptions.map((option) => <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-teal-800/70 bg-slate-950/50 p-3 hover:border-teal-500"><input type="checkbox" checked={audience.includes(option.value)} onChange={() => { setAudience((current) => { if (option.value === "all") return current.includes("all") ? [] : ["all"]; const withoutAll = current.filter((value) => value !== "all"); return withoutAll.includes(option.value) ? withoutAll.filter((value) => value !== option.value) : [...withoutAll, option.value] }); setMessage("") }} className="mt-1 accent-teal-500" /><span><span className="block font-semibold">{option.label}</span><span className="block text-xs text-teal-200/70">{option.description}</span></span></label>)}</div></div>}<label className="block text-sm font-medium">Email subject<Input value={broadcastSubject} onChange={(event) => { setBroadcastSubject(event.target.value); setMessage("") }} className="mt-2 border-slate-700 bg-slate-950" /></label><label className="block text-sm font-medium">Headline<Input value={broadcastTitle} onChange={(event) => setBroadcastTitle(event.target.value)} className="mt-2 border-slate-700 bg-slate-950" /></label><label className="block text-sm font-medium">Message<Textarea value={broadcastMessage} onChange={(event) => { setBroadcastMessage(event.target.value); setMessage("") }} className="mt-2 min-h-32 border-slate-700 bg-slate-950" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Button label<Input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} className="mt-2 border-slate-700 bg-slate-950" /></label><label className="block text-sm font-medium">Button link<Input value={portalLoginUrl} readOnly className="mt-2 border-slate-700 bg-slate-950 text-slate-400" /></label></div><Button onClick={sendEmail} disabled={isSending || (recipientMode === "categories" ? !audience.length : !manualRecipients.trim()) || !broadcastSubject.trim() || !broadcastMessage.trim()} className="bg-teal-600 hover:bg-teal-500"><Send className="mr-2 h-4 w-4" />{isSending ? "Sending…" : "Send formal broadcast"}</Button></CardContent></Card><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4" />Live preview</CardTitle></CardHeader><CardContent><div className="overflow-hidden rounded-xl border border-slate-700 bg-[#eef6f5] p-3" dangerouslySetInnerHTML={{ __html: previewHtml }} /></CardContent></Card></div></TabsContent>
      <TabsContent value="templates"><div className="grid gap-6 lg:grid-cols-[280px_1fr]"><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle>Alert types</CardTitle></CardHeader><CardContent className="space-y-2">{templates.map((template) => <button key={template.id} onClick={() => selectTemplate(template)} className={`w-full rounded-xl p-3 text-left text-sm ${selected?.id === template.id ? "bg-teal-700" : "bg-slate-950 hover:bg-slate-800"}`}><span className="block font-semibold capitalize">{template.module.replace("_", " ")}</span><span className="text-slate-400">{template.name}</span></button>)}</CardContent></Card><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle>{selected ? `Edit ${selected.name}` : "Choose an alert type"}</CardTitle><p className="text-sm text-slate-400">Use the guided fields below. The system keeps the professional QCC layout for you.</p></CardHeader><CardContent className="space-y-4">{selected && <><label className="block text-sm font-medium">Subject<Input value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} className="mt-2 border-slate-700 bg-slate-950" /></label><label className="block text-sm font-medium">Alert message<Textarea value={templateMessage} onChange={(event) => setTemplateMessage(event.target.value)} className="mt-2 min-h-36 border-slate-700 bg-slate-950" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Brand color<Input type="color" value={templateAccent} onChange={(event) => setTemplateAccent(event.target.value)} className="mt-2 h-10 border-slate-700 bg-slate-950 p-1" /></label><label className="block text-sm font-medium">Button label<Input value={templateCta} onChange={(event) => setTemplateCta(event.target.value)} className="mt-2 border-slate-700 bg-slate-950" /></label></div><div className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">Personalized values such as the staff name, request title, and request details are inserted automatically by the workflow.</div><Button onClick={saveTemplate} className="bg-teal-600 hover:bg-teal-500"><Save className="mr-2 h-4 w-4" />Save alert design</Button></>}</CardContent></Card></div></TabsContent>
      <TabsContent value="history"><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Delivery history and failures</CardTitle><p className="mt-1 text-sm text-slate-400">Review what the provider accepted or rejected. Accepted does not guarantee inbox placement.</p></div><div className="flex flex-wrap items-center gap-2"><select value={historyFilter} onChange={(event) => changeHistoryFilter(event.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><option value="all">All messages</option><option value="sent">Accepted by provider</option><option value="failed">Failed only</option></select><Button type="button" variant="outline" onClick={deleteHistory} className="border-red-800 bg-transparent text-red-300 hover:bg-red-950"><Trash2 className="mr-2 h-4 w-4" />Delete history</Button></div></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-700 text-slate-400"><tr><th className="p-3">Date</th><th className="p-3">Recipient</th><th className="p-3">Module</th><th className="p-3">Subject</th><th className="p-3">Status</th><th className="p-3">Provider ID</th><th className="p-3">Failure details</th></tr></thead><tbody>{visibleLogs.map((log) => <tr key={log.id} className="border-b border-slate-800 align-top"><td className="p-3 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td><td className="p-3">{log.recipient_email}</td><td className="p-3 capitalize">{String(log.module).replace("_", " ")}</td><td className="max-w-xs p-3">{log.subject}</td><td className={`p-3 font-semibold ${log.status === "sent" ? "text-emerald-400" : "text-red-400"}`}>{log.status === "sent" ? "Accepted by provider" : "Failed"}</td><td className="max-w-xs p-3"><code className="break-all text-xs text-slate-400">{log.provider_message_id || "—"}</code></td><td className="max-w-sm p-3 text-xs text-red-300"><div>{log.error_message || "—"}</div>{log.status === "failed" && <Button type="button" variant="outline" disabled={retryingId === log.id} onClick={() => retryAlert(log.id)} className="mt-2 h-8 border-amber-700 bg-transparent px-2 text-xs text-amber-300 hover:bg-amber-950"><RefreshCw className={`mr-1 h-3 w-3 ${retryingId === log.id ? "animate-spin" : ""}`} />{retryingId === log.id ? "Retrying…" : "Retry alert"}</Button>}</td></tr>)}</tbody></table>{!filteredLogs.length && <div className="p-10 text-center text-slate-400">No delivery records match this filter.</div>}{filteredLogs.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4"><p className="text-sm text-slate-400">Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(historyPage * HISTORY_PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length}</p><div className="flex items-center gap-2"><Button type="button" variant="outline" disabled={historyPage === 1} onClick={() => setHistoryPage((page) => page - 1)} className="border-slate-700 bg-transparent">Previous</Button><span className="text-sm text-slate-400">Page {historyPage} of {pageCount}</span><Button type="button" variant="outline" disabled={historyPage >= pageCount} onClick={() => setHistoryPage((page) => page + 1)} className="border-slate-700 bg-transparent">Next</Button></div></div>}</div></CardContent></Card></TabsContent>
    </Tabs></div></main>
}

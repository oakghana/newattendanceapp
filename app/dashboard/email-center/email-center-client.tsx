"use client"

import { useEffect, useState } from "react"
import { Mail, Save, Send, FileText, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function EmailCenterClient() {
  const [templates, setTemplates] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [recipients, setRecipients] = useState("")
  const [subject, setSubject] = useState("")
  const [html, setHtml] = useState("")
  const [message, setMessage] = useState("")

  async function load() {
    const [templateResponse, logResponse] = await Promise.all([fetch("/api/admin/email-center?view=templates"), fetch("/api/admin/email-center")])
    const templateData = await templateResponse.json()
    const logData = await logResponse.json()
    setTemplates(templateData.templates || [])
    setLogs(logData.logs || [])
    if (!selected && templateData.templates?.[0]) selectTemplate(templateData.templates[0])
  }

  function selectTemplate(template: any) {
    setSelected(template)
    setSubject(template.subject)
    setHtml(template.html_body)
  }

  useEffect(() => { load() }, [])

  async function saveTemplate() {
    if (!selected) return
    const response = await fetch("/api/admin/email-center", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, subject, html_body: html, text_body: selected.text_body, accent_color: selected.accent_color, is_active: selected.is_active }) })
    setMessage(response.ok ? "Template saved. Future alerts will use this version." : "Unable to save template.")
    await load()
  }

  async function sendEmail() {
    const response = await fetch("/api/admin/email-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipients: recipients.split(/[,\n]/), subject, html }) })
    const data = await response.json()
    setMessage(data.success ? "Email sent successfully." : data.error || "Some emails could not be sent.")
    await load()
  }

  return <main className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-teal-900 via-slate-900 to-slate-950 p-8 shadow-2xl md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-300">Administrator tools</p><h1 className="mt-2 text-4xl font-bold tracking-tight">Email center</h1><p className="mt-3 max-w-2xl text-slate-300">Compose staff emails, refine module-specific alert designs, and audit every delivery from one place.</p></div>
        <div className="rounded-2xl border border-teal-700/50 bg-teal-950/50 px-5 py-4 text-sm text-teal-100"><Mail className="mb-2 h-5 w-5" />Resend delivery is active</div>
      </header>
      {message && <div className="rounded-xl border border-teal-700 bg-teal-950/60 px-4 py-3 text-teal-100">{message}</div>}
      <Tabs defaultValue="compose" className="space-y-6">
        <TabsList className="bg-slate-900"><TabsTrigger value="compose"><Send className="mr-2 h-4 w-4" />Compose</TabsTrigger><TabsTrigger value="templates"><FileText className="mr-2 h-4 w-4" />Alert templates</TabsTrigger><TabsTrigger value="history"><History className="mr-2 h-4 w-4" />Sent history</TabsTrigger></TabsList>
        <TabsContent value="compose"><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle>Send an email to staff</CardTitle></CardHeader><CardContent className="space-y-4"><Input value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="Corporate emails, separated by commas" className="border-slate-700 bg-slate-950" /><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" className="border-slate-700 bg-slate-950" /><Textarea value={html} onChange={(event) => setHtml(event.target.value)} placeholder="Write your message or HTML email" className="min-h-64 border-slate-700 bg-slate-950 font-mono" /><Button onClick={sendEmail} className="bg-teal-600 hover:bg-teal-500"><Send className="mr-2 h-4 w-4" />Send email</Button></CardContent></Card></TabsContent>
        <TabsContent value="templates" className="grid gap-6 lg:grid-cols-[280px_1fr]"><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle>Modules</CardTitle></CardHeader><CardContent className="space-y-2">{templates.map((template) => <button key={template.id} onClick={() => selectTemplate(template)} className={`w-full rounded-xl p-3 text-left text-sm ${selected?.id === template.id ? "bg-teal-700" : "bg-slate-950 hover:bg-slate-800"}`}><span className="block font-semibold capitalize">{template.module.replace("_", " ")}</span><span className="text-slate-400">{template.name}</span></button>)}</CardContent></Card><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle>{selected ? `Edit ${selected.name}` : "Choose a template"}</CardTitle></CardHeader><CardContent className="space-y-4">{selected && <><Input value={subject} onChange={(event) => setSubject(event.target.value)} className="border-slate-700 bg-slate-950" /><Textarea value={html} onChange={(event) => setHtml(event.target.value)} className="min-h-[420px] border-slate-700 bg-slate-950 font-mono text-xs" /><p className="text-sm text-slate-400">Available variables: {'{{firstName}}'}, {'{{requestTitle}}'}, {'{{details}}'}, {'{{accentColor}}'}</p><Button onClick={saveTemplate} className="bg-teal-600 hover:bg-teal-500"><Save className="mr-2 h-4 w-4" />Save template</Button></>}</CardContent></Card></TabsContent>
        <TabsContent value="history"><Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle>System email history</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-700 text-slate-400"><tr><th className="p-3">Date</th><th className="p-3">Recipient</th><th className="p-3">Module</th><th className="p-3">Subject</th><th className="p-3">Status</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-b border-slate-800"><td className="p-3">{new Date(log.created_at).toLocaleString()}</td><td className="p-3">{log.recipient_email}</td><td className="p-3 capitalize">{String(log.module).replace("_", " ")}</td><td className="p-3">{log.subject}</td><td className={`p-3 font-semibold ${log.status === "sent" ? "text-emerald-400" : "text-red-400"}`}>{log.status}</td></tr>)}</tbody></table></div></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  </main>
}

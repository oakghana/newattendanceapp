'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface DocumentRecord { id: string; title: string; body: string; document_type: string; staff_user_id: string; version: number; updated_at: string }

export function ResumptionDelayDocumentEditor() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [selected, setSelected] = useState<DocumentRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    const response = await fetch('/api/leave/resumption-delay-documents')
    if (response.ok) setDocuments((await response.json()).documents || [])
  }
  useEffect(() => { void load() }, [])

  async function save() {
    if (!selected) return
    setSaving(true)
    setMessage('')
    const response = await fetch('/api/leave/resumption-delay-documents', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selected) })
    setSaving(false)
    setMessage(response.ok ? 'Saved. The updated document is now visible in the staff portal.' : 'Unable to save this document.')
    if (response.ok) await load()
  }

  return <Card className="bg-slate-800 border-slate-700">
    <CardHeader><CardTitle className="text-white">Resumption delay documents</CardTitle><CardDescription>Edit warnings, recommendation letters, memos, and serious warning letters. Staff can read published copies but cannot edit them.</CardDescription></CardHeader>
    <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="space-y-2">{documents.length === 0 ? <p className="text-slate-400">No generated documents yet.</p> : documents.map((document) => <button key={document.id} type="button" onClick={() => setSelected(document)} className="w-full rounded-lg border border-slate-600 p-3 text-left text-white hover:border-emerald-500"><div className="font-medium">{document.title}</div><div className="text-xs text-slate-400">{document.document_type} · v{document.version}</div></button>)}</div>
      {selected ? <div className="space-y-4"><Input value={selected.title} onChange={(event) => setSelected({ ...selected, title: event.target.value })} className="bg-slate-700 border-slate-600 text-white" /><Textarea value={selected.body} onChange={(event) => setSelected({ ...selected, body: event.target.value })} className="min-h-72 bg-slate-700 border-slate-600 text-white" /><div className="flex items-center gap-3"><Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save document'}</Button>{message && <span className="text-sm text-slate-300">{message}</span>}</div></div> : <p className="text-slate-400">Select a document to edit.</p>}
    </CardContent>
  </Card>
}

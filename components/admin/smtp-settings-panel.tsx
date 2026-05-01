"use client"

import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, Eye, EyeOff, Loader2, Mail, ShieldAlert } from "lucide-react"

interface SmtpSettingsResponse {
  smtp: {
    host: string
    port: number
    secure: boolean
    user: string
    fromName: string
    enabled: boolean
    hasPassword: boolean
    source: "database" | "environment"
  }
}

interface SavePayload {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromName: string
  enabled: boolean
}

export function SmtpSettingsPanel() {
  const [host, setHost] = useState("smtp.gmail.com")
  const [port, setPort] = useState("587")
  const [secure, setSecure] = useState<"false" | "true">("false")
  const [user, setUser] = useState("")
  const [pass, setPass] = useState("")
  const [fromName, setFromName] = useState("QCC Attendance System")
  const [enabled, setEnabled] = useState(true)
  const [hasPassword, setHasPassword] = useState(false)
  const [source, setSource] = useState<"database" | "environment">("database")

  const [testEmails, setTestEmails] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch("/api/admin/smtp-settings", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })

      const data = (await response.json()) as SmtpSettingsResponse & { error?: string }

      if (!response.ok) {
        throw new Error(data.error || "Failed to load SMTP settings")
      }

      setHost(data.smtp.host || "smtp.gmail.com")
      setPort(String(data.smtp.port || 587))
      setSecure(data.smtp.secure ? "true" : "false")
      setUser(data.smtp.user || "")
      setFromName(data.smtp.fromName || "QCC Attendance System")
      setEnabled(Boolean(data.smtp.enabled))
      setHasPassword(Boolean(data.smtp.hasPassword))
      setSource(data.smtp.source)
      setTestEmails(data.smtp.user || "")
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load SMTP settings")
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const payload: SavePayload = {
        host: host.trim(),
        port: Number.parseInt(port, 10),
        secure: secure === "true",
        user: user.trim(),
        pass: pass.trim(),
        fromName: fromName.trim(),
        enabled,
      }

      const response = await fetch("/api/admin/smtp-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = (await response.json()) as { error?: string; message?: string }

      if (!response.ok) {
        throw new Error(data.error || "Failed to save SMTP settings")
      }

      setPass("")
      setHasPassword(true)
      setMessage(data.message || "SMTP settings saved successfully")
      await loadSettings()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save SMTP settings")
    } finally {
      setSaving(false)
    }
  }

  const sendTestEmail = async () => {
    setTesting(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch("/api/admin/smtp-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmails.trim() }),
      })

      const data = (await response.json()) as { error?: string; message?: string }

      if (!response.ok) {
        throw new Error(data.error || "Failed to send test email")
      }

      setMessage(data.message || "Test email sent")
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Failed to send test email")
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Notification & SMTP Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure outgoing email for leave and loan workflow notifications.
        </p>
      </div>

      {message && (
        <Alert className="border-green-300 bg-green-50 text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {source === "environment" && (
        <Alert>
          <Mail className="h-4 w-4" />
          <AlertDescription>
            SMTP is currently driven by server environment variables. Database settings are saved, but environment
            values take precedence while they are present.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>SMTP Server</CardTitle>
          <CardDescription>
            Use Gmail SMTP with an App Password. Never use your Google account login password here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input id="smtp-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp-port">SMTP Port</Label>
              <Input id="smtp-port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp-secure">SMTP Secure</Label>
              <Select value={secure} onValueChange={(value: "true" | "false") => setSecure(value)}>
                <SelectTrigger id="smtp-secure">
                  <SelectValue placeholder="Select secure mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">false (STARTTLS, recommended for port 587)</SelectItem>
                  <SelectItem value="true">true (SSL/TLS, use port 465)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp-enabled">SMTP Enabled</Label>
              <Select value={enabled ? "true" : "false"} onValueChange={(value) => setEnabled(value === "true")}>
                <SelectTrigger id="smtp-enabled">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Enabled</SelectItem>
                  <SelectItem value="false">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="smtp-user">SMTP Username</Label>
              <Input
                id="smtp-user"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="qccalertsystem@gmail.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp-pass">SMTP Password / App Password</Label>
              <div className="relative">
                <Input
                  id="smtp-pass"
                  type={showPassword ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder={hasPassword ? "Leave blank to keep current password" : "Enter SMTP password"}
                  className="pr-12"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-8 w-8"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {hasPassword
                  ? "A password is already saved. Leave blank to keep it unchanged."
                  : "No SMTP password saved yet."}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="from-name">Sender Display Name</Label>
            <Input id="from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="QCC Attendance System" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveSettings} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save SMTP Settings
            </Button>
            <Button variant="outline" onClick={loadSettings} disabled={loading || saving || testing}>
              Reload
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send Test Email</CardTitle>
          <CardDescription>Use this after saving SMTP settings to confirm delivery.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="smtp-test-email">Test Recipient Email(s)</Label>
            <Input
              id="smtp-test-email"
              type="text"
              value={testEmails}
              onChange={(e) => setTestEmails(e.target.value)}
              placeholder="you@domain.com, hr@domain.com"
            />
            <p className="text-xs text-muted-foreground">
              Enter one or more emails separated by commas.
            </p>
          </div>

          <Button variant="secondary" onClick={sendTestEmail} disabled={testing || !testEmails.trim()}>
            {testing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Send Test Email
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

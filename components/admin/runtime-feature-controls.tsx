"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle2, Loader2, Shield, Timer } from "lucide-react"
import type { RuntimeFlags } from "@/lib/runtime-flags"

interface RuntimeFeatureControlsProps {
  initialFlags: RuntimeFlags
  initialSystemSettings: Record<string, unknown>
}

export function RuntimeFeatureControls({ initialFlags, initialSystemSettings }: RuntimeFeatureControlsProps) {
  const [passwordEnforcementEnabled, setPasswordEnforcementEnabled] = useState(initialFlags.passwordEnforcementEnabled)
  const [autoCheckoutEnabled, setAutoCheckoutEnabled] = useState(initialFlags.autoCheckoutEnabled)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setError(null)
      setMessage(null)

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemSettings: {
            settings: {
              ...initialSystemSettings,
              password_enforcement_enabled: passwordEnforcementEnabled,
              auto_checkout_enabled: autoCheckoutEnabled,
            },
          },
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Failed to save runtime controls")
      }

      setMessage("Runtime controls updated successfully.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save runtime controls")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Runtime Feature Controls</h1>
        <p className="text-muted-foreground mt-2">
          Enable or disable live platform behavior without code changes or redeployments.
        </p>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-medium">{message}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-red-700">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" />
              Password Change Enforcement
            </CardTitle>
            <CardDescription>Control forced password-change policy during login and attendance access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant={passwordEnforcementEnabled ? "default" : "secondary"}>
              {passwordEnforcementEnabled ? "Enabled" : "Disabled"}
            </Badge>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={passwordEnforcementEnabled ? "default" : "outline"}
                onClick={() => setPasswordEnforcementEnabled(true)}
              >
                Enable
              </Button>
              <Button
                type="button"
                variant={!passwordEnforcementEnabled ? "default" : "outline"}
                onClick={() => setPasswordEnforcementEnabled(false)}
              >
                Disable
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Timer className="h-5 w-5" />
              Automatic Check-out
            </CardTitle>
            <CardDescription>Allow automatic out-of-range check-out after configured rules are met.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant={autoCheckoutEnabled ? "default" : "secondary"}>
              {autoCheckoutEnabled ? "Enabled" : "Disabled"}
            </Badge>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={autoCheckoutEnabled ? "default" : "outline"}
                onClick={() => setAutoCheckoutEnabled(true)}
              >
                Enable
              </Button>
              <Button
                type="button"
                variant={!autoCheckoutEnabled ? "default" : "outline"}
                onClick={() => setAutoCheckoutEnabled(false)}
              >
                Disable
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="min-w-[180px]">
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Runtime Controls
        </Button>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle2, Loader2, Shield, Timer, Users, Clock, LogOut, UserCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { RuntimeFlags } from "@/lib/runtime-flags"

interface RuntimeFeatureControlsProps {
  initialFlags: RuntimeFlags
  initialSystemSettings: Record<string, unknown>
}

export function RuntimeFeatureControls({ initialFlags, initialSystemSettings }: RuntimeFeatureControlsProps) {
  const [passwordEnforcementEnabled, setPasswordEnforcementEnabled] = useState(initialFlags.passwordEnforcementEnabled)
  const [autoCheckoutEnabled, setAutoCheckoutEnabled] = useState(initialFlags.autoCheckoutEnabled)
  const [deviceSharingEnforcementEnabled, setDeviceSharingEnforcementEnabled] = useState(
    initialFlags.deviceSharingEnforcementEnabled
  )
  const [latenessReasonDeadline, setLatenessReasonDeadline] = useState(initialFlags.latenessReasonDeadline)
  const [checkoutCutoffTime, setCheckoutCutoffTime] = useState(initialFlags.checkoutCutoffTime)
  const [exemptPrivilegedRolesFromReason, setExemptPrivilegedRolesFromReason] = useState(initialFlags.exemptPrivilegedRolesFromReason)
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
              device_sharing_enforcement_enabled: deviceSharingEnforcementEnabled,
            },
          },
        }),
            body: JSON.stringify({
              systemSettings: {
                settings: {
                  ...initialSystemSettings,
                  password_enforcement_enabled: passwordEnforcementEnabled,
                  auto_checkout_enabled: autoCheckoutEnabled,
                  device_sharing_enforcement_enabled: deviceSharingEnforcementEnabled,
                  lateness_reason_deadline: latenessReasonDeadline,
                  checkout_cutoff_time: checkoutCutoffTime,
                  exempt_privileged_roles_from_reason: exemptPrivilegedRolesFromReason,
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                variant={passwordEnforcementEnabled ? "outline" : "default"}
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
                variant={autoCheckoutEnabled ? "outline" : "default"}
                onClick={() => setAutoCheckoutEnabled(false)}
              >
                Disable
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={deviceSharingEnforcementEnabled ? "" : "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Device Sharing Policy
            </CardTitle>
            <CardDescription>
              When enforced, staff cannot log in on a device already bound to another user.
              Disable to allow shared devices — violations are still recorded.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant={deviceSharingEnforcementEnabled ? "default" : "secondary"}>
              {deviceSharingEnforcementEnabled ? "Enforced" : "Disabled — shared devices allowed"}
            </Badge>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={deviceSharingEnforcementEnabled ? "default" : "outline"}
                onClick={() => setDeviceSharingEnforcementEnabled(true)}
              >
                Enforce
              </Button>
              <Button
                type="button"
                variant={deviceSharingEnforcementEnabled ? "outline" : "default"}
                onClick={() => setDeviceSharingEnforcementEnabled(false)}
              >
                Disable
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time & Reason Controls */}
      <div className="mt-2">
        <h2 className="text-xl font-semibold mb-1">Time &amp; Reason Controls</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Configure the times that govern when a lateness reason is required and when check-out is no longer allowed.
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Lateness reason deadline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                Lateness Reason Deadline
              </CardTitle>
              <CardDescription>
                Staff who check in after this time on a weekday must provide a reason for being late.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="lateness-deadline">Deadline time (24 h)</Label>
                <Input
                  id="lateness-deadline"
                  type="time"
                  value={latenessReasonDeadline}
                  onChange={(e) => setLatenessReasonDeadline(e.target.value)}
                  className="font-mono w-36"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Currently: <span className="font-semibold">{latenessReasonDeadline}</span>
              </p>
            </CardContent>
          </Card>

          {/* Checkout cutoff time */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LogOut className="h-5 w-5" />
                Check-out Cutoff Time
              </CardTitle>
              <CardDescription>
                Regular staff cannot check out after this time. Exempt roles (operational, security, transport) are unaffected.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="checkout-cutoff">Cutoff time (24 h)</Label>
                <Input
                  id="checkout-cutoff"
                  type="time"
                  value={checkoutCutoffTime}
                  onChange={(e) => setCheckoutCutoffTime(e.target.value)}
                  className="font-mono w-36"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Currently: <span className="font-semibold">{checkoutCutoffTime}</span>
              </p>
            </CardContent>
          </Card>

          {/* Privileged role reason exemption toggle */}
          <Card className={!exemptPrivilegedRolesFromReason ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserCheck className="h-5 w-5" />
                Privileged Role Reason Exemption
              </CardTitle>
              <CardDescription>
                When enabled, Admins, Regional Heads, Regional Managers, and Department Heads are <strong>not</strong> required
                to provide a reason for late check-ins. Disable to require reasons from everyone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Badge variant={exemptPrivilegedRolesFromReason ? "default" : "secondary"}>
                {exemptPrivilegedRolesFromReason ? "Privileged roles exempt" : "All roles must provide reason"}
              </Badge>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={exemptPrivilegedRolesFromReason ? "default" : "outline"}
                  onClick={() => setExemptPrivilegedRolesFromReason(true)}
                >
                  Exempt Privileged Roles
                </Button>
                <Button
                  type="button"
                  variant={exemptPrivilegedRolesFromReason ? "outline" : "default"}
                  onClick={() => setExemptPrivilegedRolesFromReason(false)}
                >
                  Require from All
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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

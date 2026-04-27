export type RuntimeFlags = {
  passwordEnforcementEnabled: boolean
  autoCheckoutEnabled: boolean
  deviceSharingEnforcementEnabled: boolean
  /** Time after which a lateness reason is required on weekdays (24 h "HH:MM", default "09:00") */
  latenessReasonDeadline: string
  /** Time after which check-out is blocked for regular staff (24 h "HH:MM", default "17:40") */
  checkoutCutoffTime: string
  /** When true, admin / regional-head / regional-manager / department-head are exempt from providing a lateness reason */
  exemptPrivilegedRolesFromReason: boolean
}

export const DEFAULT_RUNTIME_FLAGS: RuntimeFlags = {
  passwordEnforcementEnabled: false,
  autoCheckoutEnabled: false,
  deviceSharingEnforcementEnabled: true,
  latenessReasonDeadline: "09:00",
  checkoutCutoffTime: "17:40",
  exemptPrivilegedRolesFromReason: true,
}

export function parseRuntimeFlags(rawSettings: unknown): RuntimeFlags {
  const settings = (rawSettings || {}) as Record<string, unknown>

  return {
    // Quarterly password enforcement is disabled — always returns false regardless of DB value
    passwordEnforcementEnabled: false,
    autoCheckoutEnabled:
      typeof settings.auto_checkout_enabled === "boolean"
        ? settings.auto_checkout_enabled
        : DEFAULT_RUNTIME_FLAGS.autoCheckoutEnabled,
    deviceSharingEnforcementEnabled:
      typeof settings.device_sharing_enforcement_enabled === "boolean"
        ? settings.device_sharing_enforcement_enabled
        : DEFAULT_RUNTIME_FLAGS.deviceSharingEnforcementEnabled,
    latenessReasonDeadline:
      typeof settings.lateness_reason_deadline === "string" && /^\d{2}:\d{2}$/.test(settings.lateness_reason_deadline as string)
        ? (settings.lateness_reason_deadline as string)
        : DEFAULT_RUNTIME_FLAGS.latenessReasonDeadline,
    checkoutCutoffTime:
      typeof settings.checkout_cutoff_time === "string" && /^\d{2}:\d{2}$/.test(settings.checkout_cutoff_time as string)
        ? (settings.checkout_cutoff_time as string)
        : DEFAULT_RUNTIME_FLAGS.checkoutCutoffTime,
    exemptPrivilegedRolesFromReason:
      typeof settings.exempt_privileged_roles_from_reason === "boolean"
        ? settings.exempt_privileged_roles_from_reason
        : DEFAULT_RUNTIME_FLAGS.exemptPrivilegedRolesFromReason,
  }
}

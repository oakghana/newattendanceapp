export type RuntimeFlags = {
  passwordEnforcementEnabled: boolean
  autoCheckoutEnabled: boolean
  deviceSharingEnforcementEnabled: boolean
}

export const DEFAULT_RUNTIME_FLAGS: RuntimeFlags = {
  passwordEnforcementEnabled: false,
  autoCheckoutEnabled: false,
  deviceSharingEnforcementEnabled: true,
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
  }
}

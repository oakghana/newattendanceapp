export type RuntimeFlags = {
  passwordEnforcementEnabled: boolean
  autoCheckoutEnabled: boolean
}

export const DEFAULT_RUNTIME_FLAGS: RuntimeFlags = {
  passwordEnforcementEnabled: false,
  autoCheckoutEnabled: false,
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
  }
}

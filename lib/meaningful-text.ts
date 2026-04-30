type MeaningfulTextOptions = {
  fieldLabel?: string
  minLength?: number
}

type MeaningfulTextResult = {
  ok: boolean
  normalized: string
  error?: string
}

const LOW_SIGNAL_VALUES = new Set([
  "...",
  "..",
  ".",
  "n/a",
  "na",
  "nil",
  "none",
  "test",
  "ok",
  "fine",
  "same",
])

export function validateMeaningfulText(
  value: string | null | undefined,
  options: MeaningfulTextOptions = {},
): MeaningfulTextResult {
  const fieldLabel = options.fieldLabel ?? "This entry"
  const minLength = options.minLength ?? 8
  const normalized = String(value || "").replace(/\s+/g, " ").trim()

  if (!normalized) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} is required.`,
    }
  }

  const lowered = normalized.toLowerCase()
  const alphanumeric = normalized.replace(/[^a-z0-9]/gi, "")
  const lettersOnly = normalized.replace(/[^a-z]/gi, "")
  const uniqueLetters = new Set(lettersOnly.toLowerCase().split(""))

  if (normalized.length < minLength) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} is too short. Please enter a clear reason.`,
    }
  }

  if (LOW_SIGNAL_VALUES.has(lowered)) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} is not meaningful enough. Please enter a clear reason.`,
    }
  }

  if (!/[a-z]/i.test(normalized)) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} must contain real words, not only numbers or symbols.`,
    }
  }

  if (/^(.)\1+$/i.test(alphanumeric) || /^\d+$/.test(alphanumeric)) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} cannot be made of repeated characters or only digits.`,
    }
  }

  if (uniqueLetters.size < 3) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} must include enough detail to explain the situation clearly.`,
    }
  }

  return { ok: true, normalized }
}

export function isMeaningfulText(value: string | null | undefined, options?: MeaningfulTextOptions): boolean {
  return validateMeaningfulText(value, options).ok
}
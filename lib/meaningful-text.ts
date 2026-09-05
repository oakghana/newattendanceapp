type MeaningfulTextOptions = {
  fieldLabel?: string
  minLength?: number
  /** Minimum number of alphabetic characters required (spaces do not count). */
  minLetters?: number
  /** Minimum number of real alphabetic words required (default 0). */
  minWords?: number
  /**
   * When true (default), reject input that contains 4+ consecutive whitespace
   * characters (spaces/tabs/newlines used as filler instead of real text).
   */
  rejectExcessiveSpaces?: boolean
  /**
   * When true, require each counted word to look like a real word
   * (letters only / mostly letters, not "asdf" spam). Default true when minWords > 0.
   */
  requireMeaningfulWords?: boolean
}

type MeaningfulTextResult = {
  ok: boolean
  normalized: string
  error?: string
  wordCount?: number
  letterCount?: number
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
  "nothing",
  "whatever",
  "idk",
  "tbd",
])

/** Common filler / gibberish tokens that should not count as meaningful words. */
const MEANINGLESS_TOKENS = new Set([
  "aaa",
  "bbb",
  "ccc",
  "xxx",
  "yyy",
  "zzz",
  "asdf",
  "qwer",
  "qwerty",
  "abcd",
  "abc",
  "xyz",
  "lorem",
  "ipsum",
  "test",
  "testing",
  "dummy",
  "sample",
  "foo",
  "bar",
  "baz",
  "blah",
  "bla",
  "hmm",
  "hmmm",
  "uhh",
  "umm",
  "nah",
  "yep",
  "yup",
  "lol",
  "ok",
  "okay",
  "fine",
  "same",
  "none",
  "nil",
  "n/a",
  "na",
  "idk",
  "tbd",
  "etc",
])

/** Max consecutive whitespace characters allowed in the raw reason (3 spaces OK, 4+ not). */
export const MAX_CONSECUTIVE_WHITESPACE = 3

/**
 * Returns true when the raw string contains more than `maxConsecutive` whitespace chars in a row.
 * Detects space-padding used instead of real characters (e.g. "a    b" or long space runs).
 */
export function hasExcessiveConsecutiveWhitespace(
  value: string,
  maxConsecutive: number = MAX_CONSECUTIVE_WHITESPACE,
): boolean {
  if (!value) return false
  // \s matches space, tab, newline, etc.
  const pattern = new RegExp(`\\s{${maxConsecutive + 1},}`)
  return pattern.test(value)
}

export function hasRepeatedConsecutiveCharacters(value: string, minimum = 3): boolean {
  if (!value || minimum < 2) return false
  return new RegExp(`([^\\s])\\1{${minimum - 1},}`).test(value)
}

/**
 * Collapse runs of whitespace to a single space and trim — for storage/display only.
 * Callers should still reject excessive consecutive spaces on the raw input first.
 */
export function normalizeReasonWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

/**
 * A token counts as a "real word" when it has enough letters and is not pure filler/gibberish.
 */
export function isMeaningfulWordToken(token: string): boolean {
  const raw = String(token || "").trim()
  if (!raw) return false

  // Strip common punctuation around words
  const cleaned = raw.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "").toLowerCase()
  if (!cleaned) return false

  if (MEANINGLESS_TOKENS.has(cleaned)) return false

  // Must contain letters
  if (!/[a-z]/i.test(cleaned)) return false

  const lettersOnly = cleaned.replace(/[^a-z]/gi, "")
  // Allow short real words (I, a) but reject empty letter content
  if (lettersOnly.length < 1) return false

  // Reject pure repeated characters: "aaaa", "zzzz"
  if (/^(.)\1+$/i.test(lettersOnly)) return false

  // Reject mostly non-letter noise mixed into a "word"
  const alnum = cleaned.replace(/[^a-z0-9]/gi, "")
  if (alnum.length === 0) return false
  if (lettersOnly.length / alnum.length < 0.6) return false

  // Very short all-consonant keyboard-smash patterns (optional soft check)
  if (lettersOnly.length <= 4 && !/[aeiouy]/i.test(lettersOnly) && !/^(hr|md|qcc|gps|it|pm|am)$/i.test(lettersOnly)) {
    return false
  }

  return true
}

/**
 * Split text into tokens and count only meaningful alphabetic words.
 */
export function countMeaningfulWords(value: string): number {
  const normalized = normalizeReasonWhitespace(value)
  if (!normalized) return 0
  return normalized.split(/\s+/).filter(isMeaningfulWordToken).length
}

export function validateMeaningfulText(
  value: string | null | undefined,
  options: MeaningfulTextOptions = {},
): MeaningfulTextResult {
  const fieldLabel = options.fieldLabel ?? "This entry"
  const minLength = options.minLength ?? 8
  const minLetters = options.minLetters ?? 0
  const minWords = options.minWords ?? 0
  const rejectExcessiveSpaces = options.rejectExcessiveSpaces !== false
  const requireMeaningfulWords =
    options.requireMeaningfulWords !== undefined
      ? options.requireMeaningfulWords
      : minWords > 0

  const raw = String(value ?? "")

  if (rejectExcessiveSpaces && hasExcessiveConsecutiveWhitespace(raw)) {
    return {
      ok: false,
      normalized: normalizeReasonWhitespace(raw),
      error: `${fieldLabel} cannot contain more than ${MAX_CONSECUTIVE_WHITESPACE} continuous spaces. Please write real words without padding spaces.`,
      wordCount: 0,
    }
  }

  if (hasRepeatedConsecutiveCharacters(raw)) {
    return {
      ok: false,
      normalized: normalizeReasonWhitespace(raw),
      error: `${fieldLabel} cannot contain repeated consecutive characters such as punctuation or symbols.`,
      wordCount: 0,
      letterCount: raw.replace(/[^a-z]/gi, "").length,
    }
  }

  const normalized = normalizeReasonWhitespace(raw)

  if (!normalized) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} is required.`,
      wordCount: 0,
    }
  }

  const lowered = normalized.toLowerCase()
  const alphanumeric = normalized.replace(/[^a-z0-9]/gi, "")
  const lettersOnly = normalized.replace(/[^a-z]/gi, "")
  const uniqueLetters = new Set(lettersOnly.toLowerCase().split(""))

  if (lettersOnly.length < minLetters) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} must contain more than 20 alphabetic characters. Spaces, numbers, and punctuation do not count. You provided ${lettersOnly.length}.`,
      wordCount: countMeaningfulWords(normalized),
      letterCount: lettersOnly.length,
    }
  }

  if (normalized.length < minLength) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} is too short. Please enter a clear reason.`,
      wordCount: countMeaningfulWords(normalized),
      letterCount: lettersOnly.length,
    }
  }

  // Spaces used as character substitutes: high space-to-letter ratio
  const spaceCountInRaw = (raw.match(/\s/g) || []).length
  const letterCount = lettersOnly.length
  if (letterCount > 0 && spaceCountInRaw > letterCount * 2 && spaceCountInRaw >= 8) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} looks like spaces were used instead of real text. Please write a clear explanation with proper words.`,
      wordCount: countMeaningfulWords(normalized),
      letterCount,
    }
  }

  const wordCount = requireMeaningfulWords
    ? countMeaningfulWords(normalized)
    : normalized.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length

  if (minWords > 0) {
    if (wordCount < minWords) {
      return {
        ok: false,
        normalized,
        error: `${fieldLabel} must contain at least ${minWords} meaningful words (not spaces or filler). You provided ${wordCount}.`,
        wordCount,
        letterCount,
      }
    }
  }

  if (minLetters > 0 && wordCount === 0) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} must contain a meaningful explanation, not filler text.`,
      wordCount,
      letterCount,
    }
  }

  if (LOW_SIGNAL_VALUES.has(lowered)) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} is not meaningful enough. Please enter a clear reason.`,
      wordCount,
      letterCount,
    }
  }

  if (!/[a-z]/i.test(normalized)) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} must contain real words, not only numbers or symbols.`,
      wordCount,
      letterCount,
    }
  }

  if (/^(.)\1+$/i.test(alphanumeric) || /^\d+$/.test(alphanumeric)) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} cannot be made of repeated characters or only digits.`,
      wordCount,
      letterCount,
    }
  }

  if (uniqueLetters.size < 3) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} must include enough detail to explain the situation clearly.`,
      wordCount,
      letterCount,
    }
  }

  // When a high word count is required, also require enough unique letter variety overall
  if (minWords >= 10 && uniqueLetters.size < 8) {
    return {
      ok: false,
      normalized,
      error: `${fieldLabel} must use varied, meaningful wording — not repeated or low-detail text.`,
      wordCount,
      letterCount,
    }
  }

  return { ok: true, normalized, wordCount, letterCount }
}

/**
 * Convenience preset for attendance reasons (lateness, early checkout, off-premises, etc.).
 * Enforces: no 4+ continuous spaces, more than 20 alphabetic characters, real wording.
 */
export function validateAttendanceReason(
  value: string | null | undefined,
  fieldLabel = "Reason",
): MeaningfulTextResult {
  return validateMeaningfulText(value, {
    fieldLabel,
    minLength: 0,
    minLetters: 21,
    rejectExcessiveSpaces: true,
    requireMeaningfulWords: true,
  })
}

export function isMeaningfulText(value: string | null | undefined, options?: MeaningfulTextOptions): boolean {
  return validateMeaningfulText(value, options).ok
}

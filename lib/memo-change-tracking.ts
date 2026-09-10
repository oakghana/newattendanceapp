export type MemoDiffToken = {
  type: "equal" | "add" | "del"
  text: string
}

export type MemoFieldChange = {
  field: "subject" | "body" | "cc"
  label: string
  changed: boolean
  original: string
  current: string
  tokens: MemoDiffToken[]
}

function tokenize(value: string): string[] {
  return String(value || "").split(/(\s+)/).filter((token) => token.length > 0)
}

function longestCommonSubsequence(a: string[], b: string[]): number[][] {
  const rows = a.length
  const cols = b.length
  const table: number[][] = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0))
  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1])
    }
  }
  return table
}

export function diffMemoText(original: string, current: string): MemoDiffToken[] {
  const from = tokenize(original)
  const to = tokenize(current)
  if (from.length === 0 && to.length === 0) return []
  if (from.join("") === to.join("")) return [{ type: "equal", text: current }]

  const table = longestCommonSubsequence(from, to)
  const tokens: MemoDiffToken[] = []
  let i = from.length
  let j = to.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && from[i - 1] === to[j - 1]) {
      tokens.push({ type: "equal", text: from[i - 1] })
      i -= 1
      j -= 1
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      tokens.push({ type: "add", text: to[j - 1] })
      j -= 1
    } else {
      tokens.push({ type: "del", text: from[i - 1] })
      i -= 1
    }
  }
  return tokens.reverse()
}

export function hasMemoChanges(original: string, current: string): boolean {
  return String(original || "").trim() !== String(current || "").trim()
}

export function countMemoEdits(tokens: MemoDiffToken[]): { added: number; removed: number } {
  return tokens.reduce(
    (acc, token) => {
      if (!token.text.trim()) return acc
      if (token.type === "add") acc.added += 1
      if (token.type === "del") acc.removed += 1
      return acc
    },
    { added: 0, removed: 0 },
  )
}

export function buildMemoFieldChanges(input: {
  originalSubject?: string | null
  originalBody?: string | null
  originalCc?: string | null
  subject?: string | null
  body?: string | null
  cc?: string | null
  includeCc?: boolean
}): MemoFieldChange[] {
  const fields: MemoFieldChange[] = [
    {
      field: "subject",
      label: "Subject",
      original: String(input.originalSubject || ""),
      current: String(input.subject || ""),
      changed: hasMemoChanges(input.originalSubject || "", input.subject || ""),
      tokens: diffMemoText(input.originalSubject || "", input.subject || ""),
    },
    {
      field: "body",
      label: "Memo body",
      original: String(input.originalBody || ""),
      current: String(input.body || ""),
      changed: hasMemoChanges(input.originalBody || "", input.body || ""),
      tokens: diffMemoText(input.originalBody || "", input.body || ""),
    },
  ]
  if (input.includeCc) {
    fields.push({
      field: "cc",
      label: "CC list",
      original: String(input.originalCc || ""),
      current: String(input.cc || ""),
      changed: hasMemoChanges(input.originalCc || "", input.cc || ""),
      tokens: diffMemoText(input.originalCc || "", input.cc || ""),
    })
  }
  return fields
}

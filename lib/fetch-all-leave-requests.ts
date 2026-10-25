const PAGE_SIZE = 200
const PARALLEL_PAGES = 4

type PageResponse = { data?: any[]; records?: any[]; total?: number | null }

async function fetchPage(offset: number, params: URLSearchParams): Promise<PageResponse> {
  const query = new URLSearchParams(params)
  query.set("limit", String(PAGE_SIZE))
  query.set("offset", String(offset))
  const res = await fetch(`/api/leave/requests?${query.toString()}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

/**
 * PostgREST caps a single response at 1000 rows, so a single request with a
 * large limit silently truncates. This reads the real total from the first
 * page and fetches the remaining pages in parallel batches.
 */
export async function fetchAllLeaveRequests(
  params: Record<string, string> = {},
  onProgress?: (rows: any[], total: number) => void,
): Promise<{ rows: any[]; total: number }> {
  const baseParams = new URLSearchParams(params)
  const first = await fetchPage(0, baseParams)
  const firstRows = first.data || first.records || []
  const total = typeof first.total === "number" ? first.total : firstRows.length
  const rows = [...firstRows]
  onProgress?.(rows, total)

  const offsets: number[] = []
  for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) offsets.push(offset)

  for (let i = 0; i < offsets.length; i += PARALLEL_PAGES) {
    const batch = await Promise.all(offsets.slice(i, i + PARALLEL_PAGES).map((o) => fetchPage(o, baseParams)))
    for (const page of batch) rows.push(...(page.data || page.records || []))
    onProgress?.(rows, total)
  }

  const seen = new Set<string>()
  const unique = rows.filter((row) => {
    const id = String(row?.id || "")
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
  return { rows: unique, total }
}

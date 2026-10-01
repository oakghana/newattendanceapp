export default function TransportRequestsLoading() {
  return (
    <main className="min-h-[60vh] animate-pulse space-y-6 p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading transport requests">
      <div className="h-8 w-64 rounded-md bg-muted" />
      <div className="h-80 rounded-xl border bg-card shadow-sm" />
    </main>
  )
}

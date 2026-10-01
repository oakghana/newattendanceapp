export default function TransportLoading() {
  return (
    <main className="min-h-[60vh] animate-pulse space-y-6 p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading transport management">
      <div className="space-y-2">
        <div className="h-8 w-64 rounded-md bg-muted" />
        <div className="h-4 w-full max-w-xl rounded-md bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 rounded-xl border bg-card p-5 shadow-sm">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="mt-5 h-8 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-72 rounded-xl border bg-card shadow-sm" />
    </main>
  )
}

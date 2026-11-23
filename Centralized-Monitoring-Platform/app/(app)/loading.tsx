import { LoaderCircle } from "lucide-react"

// Shared route fallback for dashboard pages while their server data loads.
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground"
    >
      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      <span>Loading page…</span>
    </div>
  )
}

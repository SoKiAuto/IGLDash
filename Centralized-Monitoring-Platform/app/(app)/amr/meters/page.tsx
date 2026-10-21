"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Flame, Loader2, Search, WifiOff } from "lucide-react"

import { DashboardPanel } from "@/components/dashboard-panel"
import { StatusBadge } from "@/components/overview/status-badge"
import { SortableColumnHead, type ServerSortState } from "@/components/sortable-column-head"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type DeviceItem = {
  id: string
  deviceSerialNo: string
  meterSerialNo: string | null
  customerName: string | null
  gaName: string | null
  category: string | null
  status: "ONLINE" | "STALE" | "ALERT" | "NEW"
  lastSeenAt: string | null
  latestReading: { readingDate: string; gasVolume: number | null } | null
}

// Must match the keys accepted by fetchAmrDevices in lib/amr-db.ts.
type DeviceSortKey = "customer" | "meterSerial" | "deviceSerial" | "category" | "lastReading" | "status"

const SORTABLE_COLUMNS: { key: DeviceSortKey; label: string }[] = [
  { key: "customer", label: "Customer" },
  { key: "meterSerial", label: "Meter serial" },
  { key: "deviceSerial", label: "Device serial" },
  { key: "category", label: "Category" },
  { key: "lastReading", label: "Last reading" },
  { key: "status", label: "Status" },
]

type Pagination = { page: number; limit: number; totalCount: number; totalPages: number }

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "ONLINE", label: "Live" },
  { value: "ALERT", label: "Alert" },
  { value: "STALE", label: "Stale" },
  { value: "NEW", label: "New" },
]

// What each status means, shown under the filters so the labels in the table are never a guess.
const STATUS_GUIDE: { status: DeviceItem["status"]; text: string }[] = [
  { status: "ONLINE", text: "Reported in the last 24 hours and has no open alarms." },
  { status: "ALERT", text: "Reporting, but has an open warning or critical alarm." },
  { status: "STALE", text: "No reading received in the last 24 hours." },
  { status: "NEW", text: "Registered, but not yet assigned to a customer." },
]

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    ONLINE: { cls: "bg-success/10 text-success", label: "Live" },
    ALERT: { cls: "bg-destructive/10 text-destructive", label: "Alert" },
    NEW: { cls: "bg-info/10 text-info", label: "New" },
    STALE: { cls: "bg-muted text-muted-foreground", label: "Stale" },
  }
  const { cls, label } = map[status] ?? { cls: "bg-muted text-muted-foreground", label: status }
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

function CategoryPill({ category }: { category: string | null }) {
  if (!category) return <span className="text-xs text-muted-foreground">—</span>
  return <StatusBadge>{category.replace(/_/g, " ")}</StatusBadge>
}

function formatTs(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
}

export default function MetersPage() {
  const router = useRouter()
  const [devices, setDevices] = useState<DeviceItem[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, totalCount: 0, totalPages: 1 })
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  // null means the default order: device serial, A to Z.
  const [sort, setSort] = useState<ServerSortState<DeviceSortKey>>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDevices = useCallback(async (page = 1) => {
    setLoading(true)
    setError(null)
    const q = new URLSearchParams({ page: String(page), limit: "20" })
    if (statusFilter !== "all") q.set("status", statusFilter)
    if (search.trim()) q.set("search", search.trim())
    if (sort) {
      q.set("sortBy", sort.key)
      q.set("sortDirection", sort.direction)
    }
    try {
      const res = await fetch(`/api/amr/devices?${q}`)
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const data = await res.json()
      setDevices(data.items)
      setPagination(data.pagination)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load meters")
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, sort])

  useEffect(() => { fetchDevices(1) }, [fetchDevices])

  const openDevice = (deviceSerialNo: string) => router.push(`/amr/meters/${deviceSerialNo}`)

  const hasFilters = search.trim() !== "" || statusFilter !== "all"
  const firstRow = (pagination.page - 1) * pagination.limit + 1
  const lastRow = Math.min(pagination.page * pagination.limit, pagination.totalCount)
  const sortDescription = sort
    ? `Sorted by ${SORTABLE_COLUMNS.find((column) => column.key === sort.key)?.label.toLowerCase()} (${sort.direction === "asc" ? "ascending" : "descending"})`
    : "Sorted by device serial"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AMR Meters</h1>
          <p className="text-sm text-muted-foreground">
            All registered AMR gas meters · {pagination.totalCount} {hasFilters ? "matching" : "total"}
          </p>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Every gas meter reporting to the AMR platform, with its customer, category and latest
            reading time. Select a row to open its readings, consumption history and alarm limits.
          </p>
        </div>
      </div>

      <DashboardPanel
        title="Filters"
        description="Search by customer name, meter serial or device serial, and narrow the list by status."
      >
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search customer, serial…"
              aria-label="Search meters"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* `items` lets the trigger show the label instead of the raw value. */}
          <Select
            items={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={(value) => {
              if (value) setStatusFilter(value)
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 grid gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
          {STATUS_GUIDE.map((item) => (
            <div key={item.status} className="flex items-start gap-2">
              <StatusPill status={item.status} />
              <p className="text-xs text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </DashboardPanel>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <DashboardPanel
        title="Devices"
        description={`${sortDescription} · click a column heading to sort · page ${pagination.page} of ${pagination.totalPages}`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              {SORTABLE_COLUMNS.map((column) => (
                <SortableColumnHead
                  key={column.key}
                  label={column.label}
                  columnKey={column.key}
                  sort={sort}
                  onSortChange={setSort}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                  Loading meters…
                </TableCell>
              </TableRow>
            ) : devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  <WifiOff className="mx-auto mb-2 size-5" />
                  <p className="font-medium text-foreground">No meters found</p>
                  <p>Try a different search term or status filter.</p>
                </TableCell>
              </TableRow>
            ) : devices.map((device) => (
              <TableRow
                key={device.id}
                tabIndex={0}
                className="cursor-pointer"
                onClick={() => openDevice(device.deviceSerialNo)}
                onKeyDown={(event) => {
                  // Only when the row itself is focused, so Enter on the serial link does not navigate twice.
                  if (event.key === "Enter" && event.target === event.currentTarget) openDevice(device.deviceSerialNo)
                }}
              >
                <TableCell>
                  <div className="flex flex-col">
                    {device.customerName
                      ? <span className="font-medium">{device.customerName}</span>
                      : <span className="text-muted-foreground">Unassigned</span>}
                    {device.gaName && <span className="text-xs text-muted-foreground">{device.gaName}</span>}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">{device.meterSerialNo ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Flame className="size-3.5 text-muted-foreground" />
                    <Link href={`/amr/meters/${device.deviceSerialNo}`} onClick={(event) => event.stopPropagation()} className="font-medium text-primary hover:underline dark:text-info">{device.deviceSerialNo}</Link>
                  </span>
                </TableCell>
                <TableCell><CategoryPill category={device.category} /></TableCell>
                <TableCell className="text-sm tabular-nums text-muted-foreground">
                  {device.latestReading?.readingDate
                    ? formatTs(device.latestReading.readingDate)
                    : device.lastSeenAt
                    ? formatTs(device.lastSeenAt)
                    : "No data"}
                </TableCell>
                <TableCell><StatusPill status={device.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && pagination.totalPages > 1 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              Showing {firstRow}-{lastRow} of {pagination.totalCount} · page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => fetchDevices(pagination.page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchDevices(pagination.page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </DashboardPanel>
    </div>
  )
}

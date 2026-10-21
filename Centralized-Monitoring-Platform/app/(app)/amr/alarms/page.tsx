"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Bell, CheckCircle2, Clock, Search, XCircle } from "lucide-react"

import { DashboardPanel } from "@/components/dashboard-panel"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type AlarmItem = {
  id: string
  deviceSerialNo: string
  customerName: string | null
  gaName: string | null
  type: string
  cause: string
  forDate: string
  status: "OPEN" | "RESOLVED"
  severity: "CRITICAL" | "WARNING"
  acknowledged: boolean
  createdAt: string
}

type Pagination = { page: number; limit: number; totalCount: number; totalPages: number }

const TYPE_LABEL: Record<string, string> = {
  MISSING_DATA: "Missing Data",
  GAS_OUT_OF_RANGE: "Gas Out of Range",
  PRESSURE_OUT_OF_RANGE: "Pressure Out of Range",
  TEMPERATURE_OUT_OF_RANGE: "Temperature Out of Range",
  CONSUMPTION_OUT_OF_RANGE: "Consumption Out of Range",
  BATTERY_LOW: "Battery Low",
}

function SeverityBadge({ severity }: { severity: string }) {
  const isCritical = severity === "CRITICAL"
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${isCritical ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
      {isCritical ? <XCircle className="size-3" /> : <AlertTriangle className="size-3" />}
      {severity}
    </span>
  )
}

function StatusBadge({ status, acknowledged }: { status: string; acknowledged: boolean }) {
  if (acknowledged)
    return <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"><CheckCircle2 className="size-3" />ACK</span>
  if (status === "OPEN")
    return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><Bell className="size-3" />OPEN</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"><CheckCircle2 className="size-3" />RESOLVED</span>
}

function formatTs(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
}

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState<AlarmItem[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, totalCount: 0, totalPages: 1 })
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("OPEN")
  const [severityFilter, setSeverityFilter] = useState("all")
  const [ackFilter, setAckFilter] = useState("unacknowledged")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)

  const fetchAlarms = useCallback(async (page = 1) => {
    setLoading(true)
    setError(null)
    const q = new URLSearchParams({ page: String(page), limit: "20" })
    if (statusFilter !== "all") q.set("status", statusFilter)
    if (severityFilter !== "all") q.set("severity", severityFilter)
    if (ackFilter === "unacknowledged") q.set("acknowledged", "false")
    if (ackFilter === "acknowledged") q.set("acknowledged", "true")
    if (search.trim()) q.set("search", search.trim())
    try {
      const res = await fetch(`/api/amr/alarms?${q}`)
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const data = await res.json()
      setAlarms(data.items)
      setPagination(data.pagination)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alarms")
    } finally {
      setLoading(false)
    }
  }, [statusFilter, severityFilter, ackFilter, search])

  useEffect(() => { fetchAlarms(1) }, [fetchAlarms])

  async function acknowledge(id: string) {
    setAcknowledging(id)
    try {
      await fetch(`/api/amr/alarms/${id}/acknowledge`, { method: "POST" })
      fetchAlarms(pagination.page)
    } finally {
      setAcknowledging(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AMR Alarms</h1>
          <p className="text-sm text-muted-foreground">System alerts from gas meters · {pagination.totalCount} total</p>
        </div>
      </div>

      <DashboardPanel title="Filters">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" placeholder="Search device, customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
          </select>
          <select className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="all">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
          </select>
          <select className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring" value={ackFilter} onChange={(e) => setAckFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="unacknowledged">Unacknowledged</option>
            <option value="acknowledged">Acknowledged</option>
          </select>
        </div>
      </DashboardPanel>

      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      <DashboardPanel title={`Alarms · page ${pagination.page} of ${pagination.totalPages}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Device serial</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Cause</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground"><Clock className="mx-auto mb-2 size-5 animate-spin" />Loading…</TableCell></TableRow>
            ) : alarms.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">No alarms match the current filters.</TableCell></TableRow>
            ) : alarms.map((alarm) => (
              <TableRow key={alarm.id}>
                <TableCell className="font-medium">
                  {alarm.customerName ?? "Unassigned"}
                  {alarm.gaName && <span className="ml-1 text-xs text-muted-foreground">({alarm.gaName})</span>}
                </TableCell>
                <TableCell className="font-mono text-sm">{alarm.deviceSerialNo}</TableCell>
                <TableCell className="text-sm">{TYPE_LABEL[alarm.type] ?? alarm.type.replace(/_/g, " ")}</TableCell>
                <TableCell className="max-w-xs text-sm text-muted-foreground"><span className="line-clamp-2">{alarm.cause}</span></TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{formatTs(alarm.createdAt)}</TableCell>
                <TableCell><SeverityBadge severity={alarm.severity} /></TableCell>
                <TableCell><StatusBadge status={alarm.status} acknowledged={alarm.acknowledged} /></TableCell>
                <TableCell className="text-right">
                  {!alarm.acknowledged && alarm.status === "OPEN" && (
                    <Button variant="outline" size="sm" disabled={acknowledging === alarm.id} onClick={() => acknowledge(alarm.id)}>
                      {acknowledging === alarm.id ? "…" : "Acknowledge"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && pagination.totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>{pagination.totalCount} alarms · page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => fetchAlarms(pagination.page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchAlarms(pagination.page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </DashboardPanel>
    </div>
  )
}

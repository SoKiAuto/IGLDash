// Prioritized exception cards for AMR alarms, power outages, and station availability.
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Clock3,
  Zap,
} from "lucide-react"

import { DashboardPanel } from "@/components/dashboard-panel"
import type { AlarmItem } from "@/lib/amr-db"
import { formatInteger, formatPercent } from "@/lib/format"
import { formatDuration } from "@/lib/format-duration"
import { getStationName } from "@/lib/stations"

type ExceptionManagementPanelsProps = {
  hasPowerData: boolean
  powerHref: string
  outageSummary: {
    outages: number
    totalMinutes: number
    longestMinutes: number
    fillsDuring: number
  } | null
  latestOutages: {
    station: string
    startedAt: string
    durationMinutes: number
    fillsDuring: number
  }[] | null
  lowestUptime: {
    station: string
    uptime: number
    observedHours: number
    openHours: number
    coveragePercent: number | null
  }[]
  amrAlarms: AlarmItem[] | null
  amrAlarmsUnavailable: boolean
  availabilityUnavailable: boolean
  rangeLabel: string
}

const LOW_UPTIME_PERCENT = 90
const ITEMS_SHOWN = 5
const CRITICAL_DURATION_MINUTES = 120
const WARNING_DURATION_MINUTES = 30

function AmrAlarmsPanel({
  alarms,
  unavailable,
}: {
  alarms: AlarmItem[] | null
  unavailable: boolean
}) {
  const sortedAlarms = [...(alarms ?? [])].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "CRITICAL" ? -1 : 1
    return Date.parse(b.createdAt) - Date.parse(a.createdAt)
  })
  const criticalCount = sortedAlarms.filter((alarm) => alarm.severity === "CRITICAL").length

  return (
    <DashboardPanel
      title="Open AMR alarms"
      description="Unacknowledged alarms from AMR meters"
      icon={<AlertTriangle className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />}
      action={
        unavailable || alarms === null ? (
          <span className="text-xs text-muted-foreground">Data unavailable</span>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
            <span className="text-destructive">{formatInteger(criticalCount)} critical</span>
            <span className="text-amber-700 dark:text-amber-300">{formatInteger(sortedAlarms.length - criticalCount)} warning</span>
          </div>
        )
      }
    >
      {unavailable || alarms === null ? (
        <p className="rounded-lg border border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
          AMR alarm data could not be loaded.
        </p>
      ) : sortedAlarms.length === 0 ? (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-muted-foreground">
          No unacknowledged open AMR alarms.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {sortedAlarms.slice(0, ITEMS_SHOWN).map((alarm, index) => {
            const critical = alarm.severity === "CRITICAL"
            return (
              <li key={alarm.id} className={`exception-enter stagger-${Math.min(index + 1, 5)}`}>
                <Link
                  href="/amr/alarms"
                  className={`block min-h-32 rounded-lg border border-border/70 border-l-4 p-4 ${critical ? "border-l-red-500" : "border-l-amber-500"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${critical ? "text-destructive" : "text-amber-700 dark:text-amber-300"}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-semibold leading-snug">
                          {alarm.type.replaceAll("_", " ")} <span className="text-muted-foreground">·</span> {alarm.deviceSerialNo}
                        </p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {alarm.customerName ?? alarm.gaName ?? "AMR device"} · {alarm.cause}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold ${critical ? "text-destructive" : "text-amber-700 dark:text-amber-300"}`}>
                      {alarm.severity}
                    </span>
                  </div>
                  <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" aria-hidden="true" />
                    <time dateTime={alarm.createdAt}>{alarm.createdAt}</time>
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <Link href="/amr/alarms" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-destructive transition-colors hover:text-destructive/80">
        View all alarms <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </DashboardPanel>
  )
}

function outageTone(minutes: number) {
  if (minutes > CRITICAL_DURATION_MINUTES) return "bg-red-500"
  if (minutes >= WARNING_DURATION_MINUTES) return "bg-amber-400"
  return "bg-emerald-400"
}

function PowerOutagesPanel({
  hasPowerData,
  powerHref,
  outageSummary,
  latestOutages,
}: Pick<ExceptionManagementPanelsProps, "hasPowerData" | "powerHref" | "outageSummary" | "latestOutages">) {
  const averageMinutes = outageSummary && outageSummary.outages > 0
    ? Math.round(outageSummary.totalMinutes / outageSummary.outages)
    : 0
  const maxDuration = Math.max(1, ...(latestOutages ?? []).map((row) => row.durationMinutes))

  return (
    <DashboardPanel
      title="Power outages"
      description="Estimated from station voltage readings"
      icon={<Zap className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />}
      href={powerHref}
      linkLabel="Details"
    >
      {!hasPowerData ? (
        <p className="text-sm text-muted-foreground">This station has no voltage data, so outages cannot be estimated.</p>
      ) : outageSummary === null ? (
        <p className="text-sm text-muted-foreground">Outage data is not available.</p>
      ) : (
        <>
          <dl className="mb-5 grid grid-cols-2 gap-3 border-b border-border/70 pb-5 sm:grid-cols-4 sm:gap-5">
            <div>
              <dt className="text-sm text-muted-foreground">Outages</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums">{formatInteger(outageSummary.outages)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Average downtime</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatDuration(averageMinutes)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Longest</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatDuration(outageSummary.longestMinutes)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Fills during outages</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatInteger(outageSummary.fillsDuring)}</dd>
            </div>
          </dl>
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Recent outage timeline</span>
            <span>Duration</span>
          </div>
          {latestOutages === null ? (
            <p className="text-sm text-muted-foreground">Recent outage details could not be loaded.</p>
          ) : latestOutages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outages estimated in this period.</p>
          ) : (
            <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-border">
              {latestOutages.slice(0, ITEMS_SHOWN).map((outage) => {
                const tone = outageTone(outage.durationMinutes)
                return (
                  <li key={`${outage.station}-${outage.startedAt}`} className="relative grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 py-2">
                    <span className={`z-10 size-2.5 rounded-full ring-4 ring-card ${tone}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{getStationName(outage.station)}</p>
                      <p className="text-xs text-muted-foreground">{outage.startedAt} · {formatInteger(outage.fillsDuring)} fills</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${formatDuration(outage.durationMinutes)} outage duration`}>
                        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(5, (outage.durationMinutes / maxDuration) * 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-right text-sm font-semibold tabular-nums">{formatDuration(outage.durationMinutes)}</span>
                  </li>
                )
              })}
            </ol>
          )}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/70 pt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-400" /> Under 30 min</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-amber-400" /> 30–120 min</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-red-500" /> Over 120 min</span>
          </div>
        </>
      )}
    </DashboardPanel>
  )
}

function AvailabilityPanel({
  stations,
  unavailable,
}: {
  stations: ExceptionManagementPanelsProps["lowestUptime"]
  unavailable: boolean
}) {
  const needsAttention = stations.filter((row) => row.uptime < LOW_UPTIME_PERCENT)

  return (
    <DashboardPanel
      title="Low combined availability"
      description={`Stations below ${LOW_UPTIME_PERCENT}% · observed subsystem hours`}
      icon={<Activity className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />}
    >
      {unavailable ? (
        <p className="text-sm text-muted-foreground">Combined availability data could not be loaded.</p>
      ) : needsAttention.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stations below {LOW_UPTIME_PERCENT}% in the selected period.</p>
      ) : (
        <ul className="divide-y divide-border/70">
          {needsAttention.map((row) => {
            const tone = row.uptime < 70 ? "bg-red-500" : row.uptime < LOW_UPTIME_PERCENT ? "bg-amber-400" : "bg-emerald-400"
            return (
              <li key={row.station} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-4 first:pt-1 last:pb-1">
                <span className="truncate text-sm font-medium">{getStationName(row.station)}</span>
                <span className={`text-sm font-semibold tabular-nums ${row.uptime < 70 ? "text-destructive" : "text-amber-700 dark:text-amber-300"}`}>{formatPercent(row.uptime)}</span>
                <div className="col-span-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full transition-[width] duration-700 ${tone}`} style={{ width: `${Math.max(0, Math.min(100, row.uptime))}%` }} />
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  {formatInteger(row.observedHours)} of {formatInteger(row.openHours)} station-open hours observed
                  {row.coveragePercent === null ? " · coverage unavailable" : ` · ${formatPercent(row.coveragePercent)} coverage`}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardPanel>
  )
}

export function ExceptionManagementPanels(props: ExceptionManagementPanelsProps) {
  const criticalCount = props.amrAlarms?.filter((alarm) => alarm.severity === "CRITICAL").length
  const outages = props.outageSummary?.outages
  const belowThresholdCount = props.lowestUptime.filter((row) => row.uptime < LOW_UPTIME_PERCENT).length
  const updatedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date())

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <div className="exception-enter flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/70 bg-muted/40 px-4 py-3 text-sm">
          <span className="font-medium text-foreground">Live status</span>
          <span className="text-destructive">{criticalCount === undefined ? "Alarm count unavailable" : `${formatInteger(criticalCount)} critical alerts`}</span>
          <span className="text-muted-foreground">·</span>
          <span>{outages === undefined ? "Outage count unavailable" : `${formatInteger(outages)} outages in selected period`}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-amber-700 dark:text-amber-300">{props.availabilityUnavailable ? "Availability unavailable" : `${formatInteger(belowThresholdCount)} stations below ${LOW_UPTIME_PERCENT}%`}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Monitoring</span>
        </div>
      </div>
      <div className="lg:col-span-12">
        <AmrAlarmsPanel alarms={props.amrAlarms} unavailable={props.amrAlarmsUnavailable} />
      </div>
      <div className="lg:col-span-7">
        <PowerOutagesPanel
          hasPowerData={props.hasPowerData}
          powerHref={props.powerHref}
          outageSummary={props.outageSummary}
          latestOutages={props.latestOutages}
        />
      </div>
      <div className="lg:col-span-5">
        <AvailabilityPanel stations={props.lowestUptime} unavailable={props.availabilityUnavailable} />
      </div>
      <div className="lg:col-span-12 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        <span>Snapshot generated {updatedAt} IST · {props.rangeLabel}</span>
        <span>Outages estimated from voltage readings</span>
      </div>
    </div>
  )
}

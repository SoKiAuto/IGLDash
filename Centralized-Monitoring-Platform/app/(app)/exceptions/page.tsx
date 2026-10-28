// Loads exception data for the selected station and period.
import { ExceptionManagementPanels } from "@/components/exception-management-panels"
import { RangeSelector } from "@/components/range-selector"
import { fetchUnacknowledgedAlarms } from "@/lib/amr-db"
import { resolveDateRange, resolveRangePreset } from "@/lib/date-range"
import { formatDate } from "@/lib/format"
import { getCombinedStationAvailability } from "@/lib/queries/combined-availability"
import { getLatestOutages, getOutageSummary } from "@/lib/queries/power-outages"
import { getFillDateBounds } from "@/lib/queries/vehicles"
import { requireSession } from "@/lib/session"
import {
  ALL_STATIONS,
  getStationName,
  POWER_MONITORED_STATIONS,
  resolveStationFilter,
} from "@/lib/stations"

type ExceptionsPageProps = {
  searchParams: Promise<{ station?: string; range?: string }>
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

export default async function ExceptionsPage({ searchParams }: ExceptionsPageProps) {
  await requireSession()

  const [params, bounds] = await Promise.all([searchParams, getFillDateBounds()])
  const station = resolveStationFilter(params.station)
  const range = bounds
    ? resolveDateRange(resolveRangePreset(params.range), bounds)
    : { from: todayUtc(), to: todayUtc() }
  const hasPowerData =
    station === ALL_STATIONS
      ? POWER_MONITORED_STATIONS.length > 0
      : POWER_MONITORED_STATIONS.includes(station)
  const stationLabel = station === ALL_STATIONS ? "All stations" : getStationName(station)
  const powerHref = `/power?${new URLSearchParams({
    station,
    range: resolveRangePreset(params.range),
  }).toString()}`

  const [amrAlarms, outageSummary, latestOutages, combinedAvailabilityRows] =
    await Promise.all([
      fetchUnacknowledgedAlarms().catch((error) => {
        console.error("[exceptions] AMR alarms failed", error)
        return null
      }),
      hasPowerData
        ? getOutageSummary({ station, range }).catch((error) => {
            console.error("[exceptions] power outage summary failed", error)
            return null
          })
        : Promise.resolve(null),
      hasPowerData
        ? getLatestOutages({ station, range }).catch((error) => {
            console.error("[exceptions] recent power outages failed", error)
            return null
          })
        : Promise.resolve(null),
      getCombinedStationAvailability({ station, range }).catch((error) => {
        console.error("[exceptions] combined station availability failed", error)
        return null
      }),
    ])

  const lowestUptime = (combinedAvailabilityRows ?? [])
    .filter(
      (row): row is typeof row & { availabilityPercent: number } =>
        row.availabilityPercent !== null
    )
    .map((row) => ({
      station: row.station,
      uptime: row.availabilityPercent,
      observedHours: row.observedHours,
      openHours: row.openHours,
      coveragePercent: row.coveragePercent,
    }))
    .sort((a, b) => a.uptime - b.uptime)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exception management</h1>
          <p className="text-sm text-muted-foreground">
            {stationLabel} · {formatDate(range.from)} to {formatDate(range.to)}
          </p>
        </div>
        <RangeSelector />
      </div>
      <ExceptionManagementPanels
        hasPowerData={hasPowerData}
        powerHref={powerHref}
        outageSummary={outageSummary}
        latestOutages={latestOutages}
        lowestUptime={lowestUptime}
        amrAlarms={amrAlarms}
        amrAlarmsUnavailable={amrAlarms === null}
        availabilityUnavailable={combinedAvailabilityRows === null}
        rangeLabel={`${formatDate(range.from)} to ${formatDate(range.to)}`}
      />
    </div>
  )
}

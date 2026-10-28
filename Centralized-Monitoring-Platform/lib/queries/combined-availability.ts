import { Prisma } from "@/app/generated/prisma/client"
import type { DateRange } from "@/lib/date-range"
import { getHourlyCompressorStatus } from "@/lib/queries/compressors"
import { prisma } from "@/lib/prisma"
import { ALL_STATIONS, type StationFilter } from "@/lib/stations"

export type CombinedAvailabilityRow = {
  station: string
  openHours: number
  observedHours: number
  availableHours: number
  knownCompressorHours: number
  upCompressorHours: number
  availabilityPercent: number | null
  coveragePercent: number | null
}

type HourKeyRow = { station: string; hourStart: string }

export async function getCombinedStationAvailability(params: {
  station: StationFilter
  range: DateRange
}): Promise<CombinedAvailabilityRow[]> {
  const { station, range } = params
  const stationCondition =
    station === ALL_STATIONS
      ? Prisma.empty
      : Prisma.sql`AND station_name = ${station}`
  const [openHours, dispenserHours, compressorHours] = await Promise.all([
    prisma.$queryRaw<HourKeyRow[]>(Prisma.sql`
      SELECT
        station_name AS station,
        to_char(hour_start, 'YYYY-MM-DD HH24:MI:SS') AS "hourStart"
      FROM mv_station_hours
      WHERE hour_start >= ${range.from}::date
        AND hour_start < ${range.to}::date + 1
        AND is_open_day
        ${stationCondition}
      ORDER BY station_name, hour_start
    `),
    prisma.$queryRaw<HourKeyRow[]>(Prisma.sql`
      SELECT
        station_name AS station,
        to_char(date_trunc('hour', ended_at), 'YYYY-MM-DD HH24:MI:SS') AS "hourStart"
      FROM mv_dispenser_fills
      WHERE ended_at >= ${range.from}::date
        AND ended_at < ${range.to}::date + 1
        ${stationCondition}
      GROUP BY station_name, date_trunc('hour', ended_at)
    `),
    getHourlyCompressorStatus(range, station),
  ])

  const dispenserHourKeys = new Set(
    dispenserHours.map((row) => `${row.station}|${row.hourStart}`)
  )
  const compressorByHour = new Map(
    compressorHours.map((row) => [`${row.station}|${row.hourStart}`, row])
  )
  const compressorTotals = new Map<string, { knownHours: number; upHours: number }>()
  for (const row of compressorHours) {
    if (!row.hasSignal || row.isUp === null) continue
    const totals = compressorTotals.get(row.station) ?? { knownHours: 0, upHours: 0 }
    totals.knownHours += 1
    if (row.isUp) totals.upHours += 1
    compressorTotals.set(row.station, totals)
  }

  const byStation = new Map<
    string,
    { openHours: number; observedHours: number; availableHours: number }
  >()

  for (const row of openHours) {
    const totals = byStation.get(row.station) ?? {
      openHours: 0,
      observedHours: 0,
      availableHours: 0,
    }
    totals.openHours += 1

    const key = `${row.station}|${row.hourStart}`
    const compressor = compressorByHour.get(key)
    if (dispenserHourKeys.has(key) && compressor?.hasSignal && compressor.isUp !== null) {
      totals.observedHours += 1
      if (compressor.isUp) totals.availableHours += 1
    }

    byStation.set(row.station, totals)
  }

  const stations = new Set([...byStation.keys(), ...compressorTotals.keys()])
  return [...stations].map((stationName) => {
    const totals = byStation.get(stationName) ?? {
      openHours: 0,
      observedHours: 0,
      availableHours: 0,
    }
    const compressor = compressorTotals.get(stationName) ?? { knownHours: 0, upHours: 0 }
    return {
      station: stationName,
      ...totals,
      knownCompressorHours: compressor.knownHours,
      upCompressorHours: compressor.upHours,
      availabilityPercent:
        totals.observedHours > 0
          ? (totals.availableHours / totals.observedHours) * 100
          : null,
      coveragePercent:
        totals.openHours > 0 ? (totals.observedHours / totals.openHours) * 100 : null,
    }
  })
}

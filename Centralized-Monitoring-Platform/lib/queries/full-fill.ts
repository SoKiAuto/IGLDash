import { Prisma } from "@/app/generated/prisma/client"
import type { DateRange } from "@/lib/date-range"
import {
  FULL_FILL_THRESHOLD_BAR,
  VALID_END_PRESSURE_RANGE_BAR,
  VEHICLE_CLASSES,
  type VehicleClassKey,
} from "@/lib/full-fill"
import {
  rangeCondition,
  stationCondition,
} from "@/lib/queries/fill-conditions"
import { prisma } from "@/lib/prisma"
import { ALL_STATIONS, type StationFilter } from "@/lib/stations"

// These read from the mv_dispenser_fills view (see db/002_dispenser_fills.sql).
// Callers must check the session first (requireSession).

type DailyFullFillRow = { day: string; fullFills: number; belowFills: number }

type FullFillBreakdownRow = {
  label: string
  fills: number
  fullFills: number
  averageEndPressure: number
}

type VehicleClassFillRow = {
  vehicleClass: VehicleClassKey
  label: string
  fullFills: number
  belowFills: number
}

const fullFillThreshold = Prisma.sql`${FULL_FILL_THRESHOLD_BAR}::numeric`

const hasValidEndPressure = Prisma.sql`end_pressure_bar BETWEEN ${VALID_END_PRESSURE_RANGE_BAR.min}::numeric AND ${VALID_END_PRESSURE_RANGE_BAR.max}::numeric`

// Builds: CASE WHEN quantity_kg <= 4 THEN 'auto' WHEN ... ELSE 'heavy' END
// from VEHICLE_CLASSES, so the bands live in one place (lib/full-fill.ts).
const vehicleClassCase = Prisma.sql`CASE ${Prisma.join(
  VEHICLE_CLASSES.map(({ key, maxKg }) =>
    maxKg === null
      ? Prisma.sql`ELSE ${key}::text`
      : Prisma.sql`WHEN quantity_kg <= ${maxKg}::numeric THEN ${key}::text`,
  ),
  " ",
)} END`

// One row per calendar day, counting fills at or above / below the target.
export async function getDailyFullFill(params: {
  station: StationFilter
  range: DateRange
}): Promise<DailyFullFillRow[]> {
  const { station, range } = params

  return prisma.$queryRaw<DailyFullFillRow[]>(Prisma.sql`
    WITH days AS (
      SELECT generate_series(${range.from}::date, ${range.to}::date, INTERVAL '1 day')::date AS day
    ),
    counts AS (
      SELECT
        ended_at::date AS day,
        COUNT(*) FILTER (WHERE end_pressure_bar >= ${fullFillThreshold})::int AS full_fills,
        COUNT(*) FILTER (WHERE end_pressure_bar < ${fullFillThreshold})::int AS below_fills
      FROM mv_dispenser_fills
      WHERE ${rangeCondition(range)}
        AND ${hasValidEndPressure}
        ${stationCondition(station)}
      GROUP BY 1
    )
    SELECT
      to_char(days.day, 'YYYY-MM-DD') AS day,
      COALESCE(counts.full_fills, 0)::int AS "fullFills",
      COALESCE(counts.below_fills, 0)::int AS "belowFills"
    FROM days
    LEFT JOIN counts USING (day)
    ORDER BY days.day
  `)
}

// Grouped by station when all stations are selected, otherwise by dispenser.
export async function getFullFillBreakdown(params: {
  station: StationFilter
  range: DateRange
}): Promise<FullFillBreakdownRow[]> {
  const { station, range } = params
  const labelColumn =
    station === ALL_STATIONS
      ? Prisma.sql`station_name`
      : Prisma.sql`COALESCE(serial_number, 'Unknown')`

  return prisma.$queryRaw<FullFillBreakdownRow[]>(Prisma.sql`
    SELECT
      ${labelColumn} AS label,
      COUNT(*)::int AS fills,
      COUNT(*) FILTER (WHERE end_pressure_bar >= ${fullFillThreshold})::int AS "fullFills",
      AVG(end_pressure_bar)::float8 AS "averageEndPressure"
    FROM mv_dispenser_fills
    WHERE ${rangeCondition(range)}
      AND ${hasValidEndPressure}
      ${stationCondition(station)}
    GROUP BY 1
    ORDER BY fills DESC
  `)
}

// Fills at or above / below the target, per estimated vehicle class.
// Always returns every class in VEHICLE_CLASSES order, with 0 for empty ones.
export async function getFullFillByVehicleClass(params: {
  station: StationFilter
  range: DateRange
}): Promise<VehicleClassFillRow[]> {
  const { station, range } = params

  const rows = await prisma.$queryRaw<
    { vehicleClass: VehicleClassKey; fullFills: number; belowFills: number }[]
  >(Prisma.sql`
    SELECT
      ${vehicleClassCase} AS "vehicleClass",
      COUNT(*) FILTER (WHERE end_pressure_bar >= ${fullFillThreshold})::int AS "fullFills",
      COUNT(*) FILTER (WHERE end_pressure_bar < ${fullFillThreshold})::int AS "belowFills"
    FROM mv_dispenser_fills
    WHERE ${rangeCondition(range)}
      AND ${hasValidEndPressure}
      ${stationCondition(station)}
    GROUP BY 1
  `)

  return VEHICLE_CLASSES.map(({ key, label }) => {
    const row = rows.find((candidate) => candidate.vehicleClass === key)
    return {
      vehicleClass: key,
      label,
      fullFills: row?.fullFills ?? 0,
      belowFills: row?.belowFills ?? 0,
    }
  })
}

// Fills whose end pressure is missing or impossible. They are not in the rate above.
export async function getUnmeasuredFillCount(params: {
  station: StationFilter
  range: DateRange
}): Promise<number> {
  const { station, range } = params

  const [row] = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM mv_dispenser_fills
    WHERE ${rangeCondition(range)}
      AND NOT (end_pressure_bar IS NOT NULL AND ${hasValidEndPressure})
      ${stationCondition(station)}
  `)

  return row?.count ?? 0
}

export type PressureCorrelationRow = {
  pairedFills: number
  correlation: number | null
  averageCascadePressure: number | null
  averageDeliveryPressure: number | null
  averagePressureGap: number | null
}

// Pair each fill with the latest stationary-cascade priority pressure in the
// preceding 15 minutes, then summarize the paired measurements.
export async function getCascadeDeliveryPressureCorrelation(params: {
  station: StationFilter
  range: DateRange
}): Promise<PressureCorrelationRow> {
  const { station, range } = params
  const stationFilter = station === ALL_STATIONS
    ? Prisma.empty
    : Prisma.sql`AND fill.station_name = ${station}`
  const pressureStationFilter = station === ALL_STATIONS
    ? Prisma.empty
    : Prisma.sql`AND station_name = ${station}`
  const pressureStart = Prisma.sql`(${range.from}::date - INTERVAL '15 minutes')::text`
  const pressureEnd = Prisma.sql`(${range.to}::date + 1)::text`

  const [row] = await prisma.$queryRaw<PressureCorrelationRow[]>(Prisma.sql`
    WITH pressure_source AS (
      SELECT station_name, date_time, priority_pressure FROM bukt_compressor_readings
        WHERE date_time >= ${pressureStart} AND date_time < ${pressureEnd} ${pressureStationFilter}
      UNION ALL SELECT station_name, date_time, priority_pressure FROM chhatrashal_kpcl_compressor_readings
        WHERE date_time >= ${pressureStart} AND date_time < ${pressureEnd} ${pressureStationFilter}
      UNION ALL SELECT station_name, date_time, priority_pressure FROM delta_compressor_readings
        WHERE date_time >= ${pressureStart} AND date_time < ${pressureEnd} ${pressureStationFilter}
      UNION ALL SELECT station_name, date_time, priority_pressure FROM icl_compressor_readings
        WHERE date_time >= ${pressureStart} AND date_time < ${pressureEnd} ${pressureStationFilter}
      UNION ALL SELECT station_name, date_time, priority_pressure FROM sgtn2_kpcl_compressor_readings
        WHERE date_time >= ${pressureStart} AND date_time < ${pressureEnd} ${pressureStationFilter}
      UNION ALL SELECT station_name, date_time, priority_pressure FROM tulip_compressor_readings
        WHERE date_time >= ${pressureStart} AND date_time < ${pressureEnd} ${pressureStationFilter}
    ), parsed_pressure AS (
      SELECT station_name, substring(date_time from 1 for 19)::timestamp AS read_at,
        CASE WHEN btrim(priority_pressure) ~ '^[0-9]+([.][0-9]+)?$'
          THEN btrim(priority_pressure)::numeric END AS pressure_bar
      FROM pressure_source
      WHERE date_time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}'
        AND priority_pressure IS NOT NULL
    ), pressure_samples AS (
      SELECT station_name, read_at, MAX(pressure_bar) AS pressure_bar
      FROM parsed_pressure
      WHERE pressure_bar BETWEEN 0 AND 500
      GROUP BY station_name, read_at
    ), fills AS (
      SELECT ROW_NUMBER() OVER () AS fill_id, station_name,
        ended_at AS fill_at, end_pressure_bar AS delivery_bar
      FROM mv_dispenser_fills AS fill
      WHERE ${rangeCondition(range)}
        AND fill.end_pressure_bar BETWEEN 0 AND 500
        ${stationFilter}
    ), events AS (
      SELECT station_name, read_at AS event_at, 0 AS event_type,
        pressure_bar, read_at AS pressure_at,
        NULL::bigint AS fill_id, NULL::numeric AS delivery_bar
      FROM pressure_samples
      UNION ALL
      SELECT station_name, fill_at, 1, NULL::numeric, NULL::timestamp,
        fill_id, delivery_bar
      FROM fills
    ), pressure_groups AS (
      SELECT *, SUM(CASE WHEN event_type = 0 THEN 1 ELSE 0 END) OVER (
        PARTITION BY station_name ORDER BY event_at, event_type
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS pressure_group
      FROM events
    ), carried_pressure AS (
      SELECT *,
        MAX(pressure_bar) OVER (PARTITION BY station_name, pressure_group) AS cascade_bar,
        MAX(pressure_at) OVER (PARTITION BY station_name, pressure_group) AS cascade_at
      FROM pressure_groups
    ), paired AS (
      SELECT fill_id, delivery_bar, cascade_bar, cascade_at, event_at AS fill_at
      FROM carried_pressure
      WHERE fill_id IS NOT NULL
        AND pressure_group > 0
    )
    SELECT COUNT(*)::int AS "pairedFills",
      corr(cascade_bar, delivery_bar)::float8 AS correlation,
      AVG(cascade_bar)::float8 AS "averageCascadePressure",
      AVG(delivery_bar)::float8 AS "averageDeliveryPressure",
      AVG(cascade_bar - delivery_bar)::float8 AS "averagePressureGap"
    FROM paired
    WHERE cascade_at >= fill_at - INTERVAL '15 minutes'
      AND cascade_at <= fill_at
  `)

  return row ?? {
    pairedFills: 0,
    correlation: null,
    averageCascadePressure: null,
    averageDeliveryPressure: null,
    averagePressureGap: null,
  }
}

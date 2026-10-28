import { Prisma } from "@/app/generated/prisma/client"
import type { DateRange } from "@/lib/date-range"
import { prisma } from "@/lib/prisma"
import { ALL_STATIONS, type StationFilter } from "@/lib/stations"

export type DispenserArmVehicleRow = {
  station: string
  serialNumber: string
  side: string
  vehicleClass: "Auto / small" | "Car" | "Bus / heavy"
  fills: number
  kg: number
  fillSharePercent: number
}

export async function getDispenserArmVehicleBreakdown(params: {
  station: StationFilter
  range: DateRange
}): Promise<DispenserArmVehicleRow[]> {
  const { station, range } = params
  const stationCondition =
    station === ALL_STATIONS
      ? Prisma.empty
      : Prisma.sql`AND station_name = ${station}`

  return prisma.$queryRaw<DispenserArmVehicleRow[]>(Prisma.sql`
    WITH parsed AS (
      SELECT
        station_name AS station,
        NULLIF(btrim(serial_number), '') AS serial_number,
        COALESCE(NULLIF(btrim(side), ''), 'Unknown') AS side,
        CASE
          WHEN end_date_time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}'
          THEN substring(end_date_time from 1 for 19)::timestamp
        END AS ended_at,
        CASE
          WHEN btrim(quantity) ~ '^[0-9]+([.][0-9]+)?$'
          THEN btrim(quantity)::numeric
        END AS quantity_kg
      FROM dispenser_readings
      WHERE station_name IS NOT NULL
        AND end_date_time >= ${range.from}::date::text
        AND end_date_time < (${range.to}::date + 1)::text
        ${stationCondition}
    ),
    classified AS (
      SELECT
        station,
        serial_number,
        side,
        CASE
          WHEN quantity_kg <= 4 THEN 'Auto / small'
          WHEN quantity_kg <= 12 THEN 'Car'
          ELSE 'Bus / heavy'
        END AS vehicle_class,
        quantity_kg
      FROM parsed
      WHERE ended_at >= ${range.from}::date
        AND ended_at < ${range.to}::date + 1
        AND serial_number IS NOT NULL
        AND quantity_kg IS NOT NULL
        AND quantity_kg > 0
    ),
    grouped AS (
      SELECT
        station,
        serial_number,
        side,
        vehicle_class,
        COUNT(*)::int AS fills,
        SUM(quantity_kg)::float8 AS kg
      FROM classified
      GROUP BY station, serial_number, side, vehicle_class
    )
    SELECT
      station,
      serial_number AS "serialNumber",
      side,
      vehicle_class AS "vehicleClass",
      fills,
      kg,
      ROUND(
        fills::numeric * 100
        / NULLIF(SUM(fills) OVER (PARTITION BY station, serial_number, side), 0),
        1
      )::float8 AS "fillSharePercent"
    FROM grouped
    ORDER BY station, serial_number, side, vehicle_class
  `)
}

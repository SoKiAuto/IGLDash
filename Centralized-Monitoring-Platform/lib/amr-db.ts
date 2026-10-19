import { Pool } from "pg"
import { normalizeHourlyConsumption, type HourlyConsumptionPoint } from "./hourly-consumption"

const globalForAmr = globalThis as unknown as { amrPool?: Pool }

// In development Next.js reloads modules often. Keeping one pool on
// globalThis avoids opening a new connection pool on every reload.
function createAmrPool() {
  const connectionString = process.env.AMR_DB_URL
  if (!connectionString) {
    throw new Error("AMR_DB_URL is not set")
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
  })
}

export const amrPool = globalForAmr.amrPool ?? createAmrPool()

if (process.env.NODE_ENV !== "production") {
  globalForAmr.amrPool = amrPool
}

export type CustomerItem = {
  id: string
  name: string
  address: string | null
  gaName: string | null
  deviceCount: number
  activeDeviceCount: number
}

export type DeviceItem = {
  id: string
  deviceSerialNo: string
  meterSerialNo: string | null
  meterSize: string | null
  customerName: string | null
  gaName: string | null
  category: string | null
  address: string | null
  status: "ONLINE" | "STALE" | "ALERT" | "NEW"
  lastSeenAt: string | null
  pressureUpperLimit: number | null
  pressureLowerLimit: number | null
  temperatureUpperLimit: number | null
  temperatureLowerLimit: number | null
  consumptionUpperLimit: number | null
  consumptionLowerLimit: number | null
  batteryLowerLimit: number | null
  currentFlowRate: number | null
  gasPressure: number | null
  gasTemperature: number | null
  batteryLevel: number | null
  correctedVolumeVb: number | null
  latestReading: { readingDate: string; gasVolume: number | null } | null
}

export type AlarmItem = {
  id: string
  deviceId: string
  deviceSerialNo: string
  meterSerialNo: string | null
  customerName: string | null
  gaName: string | null
  type: string
  cause: string
  gasValue: number | null
  averageValue: number | null
  forDate: string
  status: "OPEN" | "RESOLVED"
  severity: "CRITICAL" | "WARNING"
  acknowledged: boolean
  createdAt: string
}

export type PaginationMeta = {
  page: number
  limit: number
  totalCount: number
  totalPages: number
}

export type AmrOverviewData = {
  totalDevices: number
  reportedToday: number
  staleDevices: number
  offlineDevices: number
  openAlarms: number
  criticalAlarms: number
  warningAlarms: number
}

export async function fetchAmrCustomers(params: {
  page?: number
  limit?: number
  search?: string
}): Promise<{ items: CustomerItem[]; pagination: PaginationMeta }> {
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.max(1, Math.min(100, params.limit ?? 25))
  const offset = (page - 1) * limit
  const search = params.search?.trim() ? `%${params.search.trim()}%` : null

  const countQuery = `
    SELECT COUNT(DISTINCT c.id)::int as count
    FROM "Customer" c
    LEFT JOIN "Device" d ON d."customerId" = c.id
    WHERE ($1::text IS NULL OR c.name ILIKE $1 OR d."deviceSerialNo" ILIKE $1)
  `

  const dataQuery = `
    SELECT
      c.id,
      c.name,
      c.address,
      ga.name as "gaName",
      COUNT(DISTINCT d.id)::int as "deviceCount",
      COUNT(DISTINCT CASE WHEN d."lastSeenAt" >= NOW() - INTERVAL '24 hours' THEN d.id END)::int as "activeDeviceCount"
    FROM "Customer" c
    LEFT JOIN "GeographicalArea" ga ON ga.id = c."gaId"
    LEFT JOIN "Device" d ON d."customerId" = c.id
    WHERE ($1::text IS NULL OR c.name ILIKE $1 OR d."deviceSerialNo" ILIKE $1)
    GROUP BY c.id, c.name, c.address, ga.name
    ORDER BY c.name ASC
    LIMIT $2 OFFSET $3
  `

  const [countRes, dataRes] = await Promise.all([
    amrPool.query(countQuery, [search]),
    amrPool.query(dataQuery, [search, limit, offset]),
  ])

  const totalCount = countRes.rows[0]?.count ?? 0
  const totalPages = Math.ceil(totalCount / limit) || 1

  return {
    items: dataRes.rows,
    pagination: { page, limit, totalCount, totalPages },
  }
}

export interface GroupedCustomerRow {
  customerId: string
  customerName: string
  address: string | null
  gaName: string | null
  gaId: string | null
  category: string | null
  deviceCount: number
  alertCount: number
  status: "ONLINE" | "STALE" | "ALERT" | "NEW"
  devices: DeviceItem[]
}

export async function fetchAmrCustomersGrouped(params: {
  page?: number
  limit?: number
  search?: string
  status?: string
  category?: string
  city?: string
}): Promise<{ items: GroupedCustomerRow[]; pagination: PaginationMeta }> {
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.max(1, Math.min(100, params.limit ?? 10))
  const offset = (page - 1) * limit
  const search = params.search?.trim() ? `%${params.search.trim()}%` : null
  const categoryFilter = params.category && params.category !== "all" ? params.category : null
  const cityFilter = params.city && params.city !== "all" ? params.city : null

  // Fetch customers with device and alert counts
  const custQuery = `
    SELECT
      c.id as "customerId",
      c.name as "customerName",
      c.address,
      ga.name as "gaName",
      c."gaId",
      COUNT(DISTINCT d.id)::int as "deviceCount",
      COUNT(DISTINCT CASE WHEN a.status = 'OPEN' THEN a.id END)::int as "alertCount"
    FROM "Customer" c
    LEFT JOIN "GeographicalArea" ga ON ga.id = c."gaId"
    LEFT JOIN "Device" d ON d."customerId" = c.id
    LEFT JOIN "Alarm" a ON a."deviceId" = d.id AND a.status = 'OPEN'
    WHERE ($1::text IS NULL OR c.name ILIKE $1 OR d."deviceSerialNo" ILIKE $1)
      AND ($2::text IS NULL OR ga.name = $2 OR c."gaId" = $2)
    GROUP BY c.id, c.name, c.address, ga.name, c."gaId"
    ORDER BY c.name ASC
  `

  const custRes = await amrPool.query(custQuery, [search, cityFilter])
  const customerIds = custRes.rows.map((r) => r.customerId)

  if (customerIds.length === 0) {
    return { items: [], pagination: { page, limit, totalCount: 0, totalPages: 1 } }
  }

  // Fetch all devices under these customers
  const devQuery = `
    SELECT
      d.id,
      d."deviceSerialNo",
      d."meterSerialNo",
      d."meterSize",
      d.category,
      d."customerId",
      c.address as address,
      d."lastSeenAt",
      d."pressureUpperLimit",
      d."pressureLowerLimit",
      d."temperatureUpperLimit",
      d."temperatureLowerLimit",
      d."consumptionUpperLimit",
      d."consumptionLowerLimit",
      d."batteryLowerLimit",
      lr."currentFlowRate",
      lr."gasPressure",
      lr."gasTemperature",
      lr."batteryLevel",
      lr."correctedVolumeVb",
      c.name as "customerName",
      ga.name as "gaName",
      CASE
        WHEN d."customerId" IS NULL THEN 'NEW'
        WHEN d."lastSeenAt" IS NULL OR d."lastSeenAt" < NOW() - INTERVAL '24 hours' THEN 'STALE'
        WHEN EXISTS (SELECT 1 FROM "Alarm" a WHERE a."deviceId" = d.id AND a.status = 'OPEN' AND a.severity IN ('CRITICAL', 'WARNING')) THEN 'ALERT'
        ELSE 'ONLINE'
      END as status
    FROM "Device" d
    JOIN "Customer" c ON c.id = d."customerId"
    LEFT JOIN "GeographicalArea" ga ON ga.id = c."gaId"
    LEFT JOIN LATERAL (
      SELECT r."currentFlowRate", r."gasPressure", r."gasTemperature", r."batteryLevel", r."correctedVolumeVb"
      FROM "Reading" r
      WHERE r."deviceId" = d.id
      ORDER BY r."readingDate" DESC
      LIMIT 1
    ) lr ON true
    WHERE d."customerId" = ANY($1)
    ORDER BY d."deviceSerialNo" ASC
  `

  const devRes = await amrPool.query(devQuery, [customerIds])

  const devMap = new Map<string, DeviceItem[]>()
  devRes.rows.forEach((r) => {
    const list = devMap.get(r.customerId) ?? []
    list.push({
      id: r.id,
      deviceSerialNo: r.deviceSerialNo,
      meterSerialNo: r.meterSerialNo,
      meterSize: r.meterSize,
      customerName: r.customerName,
      gaName: r.gaName,
      category: r.category,
      address: r.address,
      status: r.status,
      lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : null,
      pressureUpperLimit: r.pressureUpperLimit,
      pressureLowerLimit: r.pressureLowerLimit,
      temperatureUpperLimit: r.temperatureUpperLimit,
      temperatureLowerLimit: r.temperatureLowerLimit,
      consumptionUpperLimit: r.consumptionUpperLimit,
      consumptionLowerLimit: r.consumptionLowerLimit,
      batteryLowerLimit: r.batteryLowerLimit,
      currentFlowRate: r.currentFlowRate !== null ? Number(r.currentFlowRate) : null,
      gasPressure: r.gasPressure !== null ? Number(r.gasPressure) : null,
      gasTemperature: r.gasTemperature !== null ? Number(r.gasTemperature) : null,
      batteryLevel: r.batteryLevel !== null ? Number(r.batteryLevel) : null,
      correctedVolumeVb: r.correctedVolumeVb !== null ? Number(r.correctedVolumeVb) : null,
      latestReading: r.correctedVolumeVb !== null ? { readingDate: r.lastSeenAt, gasVolume: Number(r.correctedVolumeVb) } : null,
    })
    devMap.set(r.customerId, list)
  })

  let grouped: GroupedCustomerRow[] = custRes.rows.map((c) => {
    const devs = devMap.get(c.customerId) ?? []
    const cat = devs[0]?.category ?? null
    let custStatus: "ONLINE" | "STALE" | "ALERT" | "NEW" = "ONLINE"
    if (c.alertCount > 0 || devs.some((d) => d.status === "ALERT")) {
      custStatus = "ALERT"
    } else if (devs.every((d) => d.status === "STALE")) {
      custStatus = "STALE"
    } else if (devs.length === 0) {
      custStatus = "NEW"
    }
    return {
      customerId: c.customerId,
      customerName: c.customerName,
      address: c.address,
      gaName: c.gaName,
      gaId: c.gaId,
      category: cat,
      deviceCount: c.deviceCount,
      alertCount: c.alertCount,
      status: custStatus,
      devices: devs,
    }
  })

  // Apply status and category filters in memory
  if (params.status && params.status !== "all") {
    grouped = grouped.filter((g) => g.status.toLowerCase() === params.status?.toLowerCase())
  }
  if (categoryFilter) {
    grouped = grouped.filter((g) => g.devices.some((d) => d.category === categoryFilter))
  }

  const totalCount = grouped.length
  const totalPages = Math.ceil(totalCount / limit) || 1
  const paginated = grouped.slice(offset, offset + limit)

  return { items: paginated, pagination: { page, limit, totalCount, totalPages } }
}

export async function fetchGasList(): Promise<Array<{ id: string; name: string }>> {
  const res = await amrPool.query('SELECT id, name FROM "GeographicalArea" ORDER BY name ASC')
  return res.rows
}

export async function updateDeviceThresholds(
  id: string,
  thresholds: {
    pressureUpperLimit?: number | null
    pressureLowerLimit?: number | null
    temperatureUpperLimit?: number | null
    temperatureLowerLimit?: number | null
    consumptionUpperLimit?: number | null
    consumptionLowerLimit?: number | null
    batteryLowerLimit?: number | null
  }
): Promise<boolean> {
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1

  for (const [k, v] of Object.entries(thresholds)) {
    if (v !== undefined) {
      fields.push(`"${k}" = $${idx++}`)
      values.push(v)
    }
  }

  if (fields.length === 0) return true
  values.push(id)

  const res = await amrPool.query(
    `UPDATE "Device" SET ${fields.join(", ")} WHERE id = $${idx} OR "deviceSerialNo" = $${idx}`,
    values
  )
  return (res.rowCount ?? 0) > 0
}

export async function fetchMeterDetails(id: string) {
  const devRes = await amrPool.query(
    `
    SELECT
      d.*,
      c.name as "customerName",
      ga.name as "gaName",
      CASE
        WHEN d."customerId" IS NULL THEN 'NEW'
        WHEN d."lastSeenAt" IS NULL OR d."lastSeenAt" < NOW() - INTERVAL '24 hours' THEN 'STALE'
        WHEN EXISTS (SELECT 1 FROM "Alarm" a WHERE a."deviceId" = d.id AND a.status = 'OPEN' AND a.severity IN ('CRITICAL', 'WARNING')) THEN 'ALERT'
        ELSE 'ONLINE'
      END as status
    FROM "Device" d
    LEFT JOIN "Customer" c ON c.id = d."customerId"
    LEFT JOIN "GeographicalArea" ga ON ga.id = c."gaId"
    WHERE d.id = $1 OR d."deviceSerialNo" = $1
    LIMIT 1
  `,
    [id]
  )

  const device = devRes.rows[0]
  if (!device) return null

  // Fetch latest reading
  const readingRes = await amrPool.query(
    `
    SELECT *
    FROM "Reading"
    WHERE "deviceId" = $1
    ORDER BY "readingDate" DESC
    LIMIT 2
  `,
    [device.id]
  )

  const latest = readingRes.rows[0] ?? null
  const previous = readingRes.rows[1] ?? null

  const todayVolumeDelta =
    latest && previous && latest.correctedVolumeVb !== null && previous.correctedVolumeVb !== null
      ? Math.max(0, latest.correctedVolumeVb - previous.correctedVolumeVb)
      : (latest?.correctedVolumeVb ?? 0)

  const todayUncorrectedVolumeDelta =
    latest && previous && latest.uncorrectedVolumeVm !== null && previous.uncorrectedVolumeVm !== null
      ? Math.max(0, latest.uncorrectedVolumeVm - previous.uncorrectedVolumeVm)
      : (latest?.uncorrectedVolumeVm ?? 0)

  return {
    device: {
      ...device,
      lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : null,
      firstSeenAt: device.firstSeenAt ? new Date(device.firstSeenAt).toISOString() : null,
    },
    latestReading: latest
      ? {
        ...latest,
        readingDate: new Date(latest.readingDate).toISOString(),
      }
      : null,
    todayVolumeDelta,
    todayUncorrectedVolumeDelta,
  }
}

export type MeterHourly = {
  date: string | null
  hourlyConsumption: HourlyConsumptionPoint[]
}

export async function fetchMeterHourly(id: string): Promise<MeterHourly> {
  const devRes = await amrPool.query(
    `SELECT id FROM "Device" WHERE id = $1 OR "deviceSerialNo" = $1 LIMIT 1`,
    [id]
  )
  const deviceId = devRes.rows[0]?.id
  if (!deviceId) return { date: null, hourlyConsumption: [] }

  const readingRes = await amrPool.query(
    `
    SELECT "readingDate", "hourlyConsumption"
    FROM "Reading"
    WHERE "deviceId" = $1 AND "hourlyConsumption" IS NOT NULL
    ORDER BY "readingDate" DESC
    LIMIT 1
  `,
    [deviceId]
  )

  const row = readingRes.rows[0]
  if (!row?.hourlyConsumption) return { date: null, hourlyConsumption: [] }

  const raw = typeof row.hourlyConsumption === "string" ? JSON.parse(row.hourlyConsumption) : row.hourlyConsumption
  return {
    date: new Date(row.readingDate).toISOString().slice(0, 10),
    hourlyConsumption: normalizeHourlyConsumption(raw),
  }
}

export async function fetchFleetConsumptionSeries(period = "daily") {
  // Bucketed sums for CNG and PNG
  const days = period === "monthly" ? 30 : period === "quarterly" ? 90 : period === "yearly" ? 365 : 14

  const query = `
    SELECT
      TO_CHAR(r."readingDate", 'DD-Mon') as label,
      DATE(r."readingDate") as day,
      COALESCE(SUM(CASE WHEN d.category = 'INDUSTRIAL_CNG' THEN r."correctedVolumeVb" / 100 END), 0)::numeric(10,2) as "cngValue",
      COALESCE(SUM(CASE WHEN d.category = 'INDUSTRIAL_PNG' THEN r."correctedVolumeVb" / 100 END), 0)::numeric(10,2) as "pngValue",
      COALESCE(SUM(r."correctedVolumeVb" / 100), 0)::numeric(10,2) as value
    FROM "Reading" r
    JOIN "Device" d ON d.id = r."deviceId"
    WHERE r."readingDate" >= NOW() - ($1 || ' days')::interval
    GROUP BY DATE(r."readingDate"), TO_CHAR(r."readingDate", 'DD-Mon')
    ORDER BY DATE(r."readingDate") ASC
  `
  const res = await amrPool.query(query, [days])
  return res.rows.map((r) => ({
    label: r.label,
    cngValue: Number(r.cngValue),
    pngValue: Number(r.pngValue),
    value: Number(r.value),
    suspect: false,
  }))
}

// Columns the Meters table can be sorted by. The values are SQL expressions and are only ever
// picked from this fixed map, so user input never reaches the query text.
const DEVICE_SORT_COLUMNS = {
  customer: 'e."customerName"',
  meterSerial: 'e."meterSerialNo"',
  deviceSerial: 'e."deviceSerialNo"',
  category: "e.category",
  lastReading: 'lr."readingDate"',
  status: "e.status",
} as const

export type DeviceSortKey = keyof typeof DEVICE_SORT_COLUMNS

export function isDeviceSortKey(value: string | undefined): value is DeviceSortKey {
  return value !== undefined && value in DEVICE_SORT_COLUMNS
}

export async function fetchAmrDevices(params: {
  page?: number
  limit?: number
  search?: string
  status?: string
  sortBy?: string
  sortDirection?: string
}): Promise<{ items: DeviceItem[]; pagination: PaginationMeta }> {
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.max(1, Math.min(100, params.limit ?? 20))
  const offset = (page - 1) * limit
  const search = params.search?.trim() ? `%${params.search.trim()}%` : null
  const statusFilter = params.status && params.status !== "all" ? params.status.toUpperCase() : null
  const sortColumn = DEVICE_SORT_COLUMNS[isDeviceSortKey(params.sortBy) ? params.sortBy : "deviceSerial"]
  const sortDirection = params.sortDirection?.toLowerCase() === "desc" ? "DESC" : "ASC"

  const baseFromWhere = `
    FROM "Device" d
    LEFT JOIN "Customer" c ON c.id = d."customerId"
    LEFT JOIN "GeographicalArea" ga ON ga.id = c."gaId"
    WHERE ($1::text IS NULL OR d."deviceSerialNo" ILIKE $1 OR d."meterSerialNo" ILIKE $1 OR c.name ILIKE $1)
  `

  const queryWithStatus = `
    WITH evaluated AS (
      SELECT
        d.id,
        d."deviceSerialNo",
        d."meterSerialNo",
        d."meterSize",
        d.category,
        c.address as address,
        d."lastSeenAt",
        d."pressureUpperLimit",
        d."pressureLowerLimit",
        d."temperatureUpperLimit",
        d."temperatureLowerLimit",
        d."consumptionUpperLimit",
        d."consumptionLowerLimit",
        d."batteryLowerLimit",
        c.name as "customerName",
        ga.name as "gaName",
        CASE
          WHEN d."customerId" IS NULL THEN 'NEW'
          WHEN d."lastSeenAt" IS NULL OR d."lastSeenAt" < NOW() - INTERVAL '24 hours' THEN 'STALE'
          WHEN EXISTS (SELECT 1 FROM "Alarm" a WHERE a."deviceId" = d.id AND a.status = 'OPEN' AND a.severity IN ('CRITICAL', 'WARNING')) THEN 'ALERT'
          ELSE 'ONLINE'
        END as status
      ${baseFromWhere}
    )
    SELECT
      e.*,
      lr."readingDate",
      lr."correctedVolumeVb" as "gasVolume",
      lr."currentFlowRate",
      lr."gasPressure",
      lr."gasTemperature",
      lr."batteryLevel",
      lr."correctedVolumeVb"
    FROM evaluated e
    LEFT JOIN LATERAL (
      SELECT r."readingDate", r."correctedVolumeVb", r."currentFlowRate", r."gasPressure", r."gasTemperature", r."batteryLevel"
      FROM "Reading" r
      WHERE r."deviceId" = e.id
      ORDER BY r."readingDate" DESC
      LIMIT 1
    ) lr ON true
    WHERE ($2::text IS NULL OR e.status = $2)
    ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, e."deviceSerialNo" ASC
    LIMIT $3 OFFSET $4
  `

  const countQuery = `
    WITH evaluated AS (
      SELECT
        d.id,
        CASE
          WHEN d."customerId" IS NULL THEN 'NEW'
          WHEN d."lastSeenAt" IS NULL OR d."lastSeenAt" < NOW() - INTERVAL '24 hours' THEN 'STALE'
          WHEN EXISTS (SELECT 1 FROM "Alarm" a WHERE a."deviceId" = d.id AND a.status = 'OPEN' AND a.severity IN ('CRITICAL', 'WARNING')) THEN 'ALERT'
          ELSE 'ONLINE'
        END as status
      ${baseFromWhere}
    )
    SELECT COUNT(*)::int as count
    FROM evaluated
    WHERE ($2::text IS NULL OR status = $2)
  `

  const [countRes, dataRes] = await Promise.all([
    amrPool.query(countQuery, [search, statusFilter]),
    amrPool.query(queryWithStatus, [search, statusFilter, limit, offset]),
  ])

  const totalCount = countRes.rows[0]?.count ?? 0
  const totalPages = Math.ceil(totalCount / limit) || 1

  const items: DeviceItem[] = dataRes.rows.map((row) => ({
    id: row.id,
    deviceSerialNo: row.deviceSerialNo,
    meterSerialNo: row.meterSerialNo,
    meterSize: row.meterSize,
    customerName: row.customerName,
    gaName: row.gaName,
    category: row.category,
    address: row.address,
    status: row.status,
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
    pressureUpperLimit: row.pressureUpperLimit,
    pressureLowerLimit: row.pressureLowerLimit,
    temperatureUpperLimit: row.temperatureUpperLimit,
    temperatureLowerLimit: row.temperatureLowerLimit,
    consumptionUpperLimit: row.consumptionUpperLimit,
    consumptionLowerLimit: row.consumptionLowerLimit,
    batteryLowerLimit: row.batteryLowerLimit,
    currentFlowRate: row.currentFlowRate !== null ? Number(row.currentFlowRate) : null,
    gasPressure: row.gasPressure !== null ? Number(row.gasPressure) : null,
    gasTemperature: row.gasTemperature !== null ? Number(row.gasTemperature) : null,
    batteryLevel: row.batteryLevel !== null ? Number(row.batteryLevel) : null,
    correctedVolumeVb: row.correctedVolumeVb !== null ? Number(row.correctedVolumeVb) : null,
    latestReading: row.readingDate
      ? {
        readingDate: new Date(row.readingDate).toISOString(),
        gasVolume: row.gasVolume !== null ? Number(row.gasVolume) : null,
      }
      : null,
  }))

  return { items, pagination: { page, limit, totalCount, totalPages } }
}

export async function fetchAmrAlarms(params: {
  page?: number
  limit?: number
  status?: string
  severity?: string
  type?: string
  acknowledged?: boolean
  search?: string
}): Promise<{ items: AlarmItem[]; pagination: PaginationMeta }> {
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.max(1, Math.min(100, params.limit ?? 20))
  const offset = (page - 1) * limit
  const search = params.search?.trim() ? `%${params.search.trim()}%` : null
  const status = params.status && params.status !== "all" ? params.status.toUpperCase() : null
  const severity = params.severity && params.severity !== "all" ? params.severity.toUpperCase() : null
  const type = params.type && params.type !== "all" ? params.type : null
  const ack = params.acknowledged !== undefined ? params.acknowledged : null

  const whereClause = `
    WHERE ($1::text IS NULL OR a.status::text = $1)
      AND ($2::text IS NULL OR a.severity::text = $2)
      AND ($3::text IS NULL OR a.type::text = $3)
      AND ($4::boolean IS NULL OR a.acknowledged = $4)
      AND ($5::text IS NULL OR d."deviceSerialNo" ILIKE $5 OR c.name ILIKE $5 OR a.cause ILIKE $5)
  `

  const countQuery = `
    SELECT COUNT(*)::int as count
    FROM "Alarm" a
    JOIN "Device" d ON d.id = a."deviceId"
    LEFT JOIN "Customer" c ON c.id = d."customerId"
    ${whereClause}
  `

  const dataQuery = `
    SELECT
      a.id,
      a."deviceId",
      a.type,
      a.severity,
      a.cause,
      a."gasValue",
      a."averageValue",
      a."forDate",
      a.status,
      a.acknowledged,
      a."createdAt",
      d."deviceSerialNo",
      d."meterSerialNo",
      c.name as "customerName",
      ga.name as "gaName"
    FROM "Alarm" a
    JOIN "Device" d ON d.id = a."deviceId"
    LEFT JOIN "Customer" c ON c.id = d."customerId"
    LEFT JOIN "GeographicalArea" ga ON ga.id = c."gaId"
    ${whereClause}
    ORDER BY a."createdAt" DESC
    LIMIT $6 OFFSET $7
  `

  const [countRes, dataRes] = await Promise.all([
    amrPool.query(countQuery, [status, severity, type, ack, search]),
    amrPool.query(dataQuery, [status, severity, type, ack, search, limit, offset]),
  ])

  const totalCount = countRes.rows[0]?.count ?? 0
  const totalPages = Math.ceil(totalCount / limit) || 1

  const items: AlarmItem[] = dataRes.rows.map((row) => ({
    id: row.id,
    deviceId: row.deviceId,
    deviceSerialNo: row.deviceSerialNo,
    meterSerialNo: row.meterSerialNo,
    customerName: row.customerName,
    gaName: row.gaName,
    type: row.type,
    cause: row.cause,
    gasValue: row.gasValue !== null ? Number(row.gasValue) : null,
    averageValue: row.averageValue !== null ? Number(row.averageValue) : null,
    forDate: row.forDate ? new Date(row.forDate).toISOString().split("T")[0] : "",
    status: row.status,
    severity: row.severity,
    acknowledged: Boolean(row.acknowledged),
    createdAt: new Date(row.createdAt).toISOString(),
  }))

  return { items, pagination: { page, limit, totalCount, totalPages } }
}

export async function acknowledgeAmrAlarm(id: string): Promise<boolean> {
  const res = await amrPool.query(
    `UPDATE "Alarm" SET acknowledged = true, "acknowledgedAt" = NOW() WHERE id = $1 RETURNING id`,
    [id]
  )
  return (res.rowCount ?? 0) > 0
}

export async function fetchAmrOverview(): Promise<AmrOverviewData> {
  const query = `
    SELECT
      (SELECT COUNT(*)::int FROM "Device") as "totalDevices",
      (SELECT COUNT(*)::int FROM "Device" WHERE "lastSeenAt" >= CURRENT_DATE) as "reportedToday",
      (SELECT COUNT(*)::int FROM "Device" WHERE "lastSeenAt" IS NULL OR "lastSeenAt" < NOW() - INTERVAL '24 hours') as "offlineDevices",
      (SELECT COUNT(*)::int FROM "Alarm" WHERE status = 'OPEN') as "openAlarms",
      (SELECT COUNT(*)::int FROM "Alarm" WHERE status = 'OPEN' AND severity = 'CRITICAL') as "criticalAlarms",
      (SELECT COUNT(*)::int FROM "Alarm" WHERE status = 'OPEN' AND severity = 'WARNING') as "warningAlarms"
  `
  const res = await amrPool.query(query)
  const row = res.rows[0] ?? {}
  const total = row.totalDevices ?? 0
  const today = row.reportedToday ?? 0

  return {
    totalDevices: total,
    reportedToday: today,
    staleDevices: Math.max(0, total - today),
    offlineDevices: row.offlineDevices ?? 0,
    openAlarms: row.openAlarms ?? 0,
    criticalAlarms: row.criticalAlarms ?? 0,
    warningAlarms: row.warningAlarms ?? 0,
  }
}

export async function fetchUnacknowledgedAlarms(): Promise<AlarmItem[]> {
  const res = await amrPool.query(`
    SELECT
      a.id,
      a."deviceId",
      a.type,
      a.severity,
      a.cause,
      a."gasValue",
      a."averageValue",
      a."forDate",
      a.status,
      a.acknowledged,
      a."createdAt",
      d."deviceSerialNo",
      d."meterSerialNo",
      c.name as "customerName",
      ga.name as "gaName"
    FROM "Alarm" a
    JOIN "Device" d ON d.id = a."deviceId"
    LEFT JOIN "Customer" c ON c.id = d."customerId"
    LEFT JOIN "GeographicalArea" ga ON ga.id = c."gaId"
    WHERE a.acknowledged = false AND a.status = 'OPEN'
    ORDER BY
      CASE WHEN a.severity = 'CRITICAL' THEN 0 ELSE 1 END,
      a."createdAt" DESC
    LIMIT 10
  `)

  return res.rows.map((row) => ({
    id: row.id,
    deviceId: row.deviceId,
    deviceSerialNo: row.deviceSerialNo,
    meterSerialNo: row.meterSerialNo,
    customerName: row.customerName,
    gaName: row.gaName,
    type: row.type,
    cause: row.cause,
    gasValue: row.gasValue !== null ? Number(row.gasValue) : null,
    averageValue: row.averageValue !== null ? Number(row.averageValue) : null,
    forDate: row.forDate ? new Date(row.forDate).toISOString().split("T")[0] : "",
    status: row.status,
    severity: row.severity,
    acknowledged: false,
    createdAt: new Date(row.createdAt).toISOString(),
  }))
}

export async function fetchMeterHistory(id: string, days = 30) {
  const devRes = await amrPool.query('SELECT id FROM "Device" WHERE id = $1 OR "deviceSerialNo" = $1 LIMIT 1', [id])
  const deviceId = devRes.rows[0]?.id
  if (!deviceId) return []

  const res = await amrPool.query(
    `SELECT
      TO_CHAR(r."readingDate", 'YYYY-MM-DD') as date,
      r."readingDate" as timestamp,
      r."correctedVolumeVb",
      r."uncorrectedVolumeVm",
      r."gasPressure",
      r."gasTemperature",
      r."batteryLevel"
    FROM "Reading" r
    WHERE r."deviceId" = $1
    ORDER BY r."readingDate" DESC
    LIMIT $2`,
    [deviceId, days]
  )
  return res.rows
}

export async function fetchMeterConsumption(id: string, period = "daily") {
  const devRes = await amrPool.query('SELECT id FROM "Device" WHERE id = $1 OR "deviceSerialNo" = $1 LIMIT 1', [id])
  const deviceId = devRes.rows[0]?.id
  if (!deviceId) return { consumption: [], uncorrectedConsumption: [] }

  const days = period === "monthly" ? 30 : period === "quarterly" ? 90 : period === "yearly" ? 365 : 14

  const res = await amrPool.query(
    `SELECT
      TO_CHAR(r."readingDate", 'DD-Mon') as label,
      TO_CHAR(r."readingDate", 'YYYY-MM-DD') as "startDate",
      TO_CHAR(r."readingDate", 'YYYY-MM-DD') as "endDate",
      COALESCE(r."correctedVolumeVb" / 100, 0)::numeric(10,2) as value,
      COALESCE(r."uncorrectedVolumeVm" / 100, 0)::numeric(10,2) as "uncorrectedValue",
      false as suspect
    FROM "Reading" r
    WHERE r."deviceId" = $1 AND r."readingDate" >= NOW() - ($2 || ' days')::interval
    ORDER BY r."readingDate" ASC`,
    [deviceId, days]
  )

  const consumption = res.rows.map((r) => ({
    label: r.label,
    startDate: r.startDate,
    endDate: r.endDate,
    value: Number(r.value),
    suspect: false,
  }))

  const uncorrectedConsumption = res.rows.map((r) => ({
    label: r.label,
    startDate: r.startDate,
    endDate: r.endDate,
    value: Number(r.uncorrectedValue),
    suspect: false,
  }))

  return { consumption, uncorrectedConsumption }
}
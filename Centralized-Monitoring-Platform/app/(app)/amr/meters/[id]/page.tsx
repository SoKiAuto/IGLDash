"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  XAxis,
  YAxis,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Thermometer,
  Gauge,
  Layers,
  Info,
  Activity,
} from "lucide-react";
import { DashboardPanel } from "@/components/dashboard-panel";
import { ExportContextSetter } from "@/components/export-context-setter";
import { ChartExportData } from "@/components/export/chart-export-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLocalTs, cn } from "@/lib/utils";
import { CHART_COLORS } from "@/lib/chart-colors";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PeriodSelector } from "@/components/ui/period-selector";
import { ConsumptionAreaChart } from "@/components/amr/consumption-area-chart";
import { readingTrendTable } from "@/lib/export/chart-table";
import { pickTicks, tickCountForMode, type ConsumptionBucket, type ConsumptionMode } from "@/lib/consumption-series";
import type { HourlyConsumptionPoint } from "@/lib/hourly-consumption";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeviceData {
  id: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  meterSize: string | null;
  firmwareVersion: string | null;
  hardwareVersion: string | null;
  deviceModel: string | null;
  configurationVersion: string | null;
  customerName: string | null;
  gaName: string | null;
  firstSeenAt: string;
  lastSeenAt: string | null;
  batteryLowerLimit: number | null;
  pressureUpperLimit: number | null;
  pressureLowerLimit: number | null;
  temperatureUpperLimit: number | null;
  temperatureLowerLimit: number | null;
  consumptionUpperLimit: number | null;
  consumptionLowerLimit: number | null;
}

interface LatestReading {
  id: string;
  readingDate: string;
  correctedVolumeVb: number | null;
  uncorrectedVolumeVm: number | null;
  gasPressure: number | null;
  gasTemperature: number | null;
  compressibilityZ: number | null;
  compressibilityFpv: number | null;
  correctionFactorC: number | null;
  gasDensity: number | null;
  hourlyConsumption: HourlyConsumptionPoint[] | null;
  batteryLevel: number | null;
}

interface HourlyData {
  date: string | null;
  hourlyConsumption: HourlyConsumptionPoint[];
}

interface HistoryRow {
  date: string;
  timestamp: string; // ISO measurement time from readingDate
  correctedVolumeVb: number | null;
  uncorrectedVolumeVm: number | null;
  gasPressure: number | null;
  gasTemperature: number | null;
}

const HOURS_PER_DAY = 24;
const HOURLY_WINDOW_START = 7;
const HOURLY_WINDOW_TICKS = ["07:00", "11:00", "15:00", "19:00", "23:00", "03:00", "06:00"];
const HOURLY_DAY_TICKS = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];

const TREND_OPTIONS = [7, 30, 90] as const;
type TrendDays = (typeof TREND_OPTIONS)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "—";
  return val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 86_400_000);
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// A label and value on one line, used for the small reference tables inside a panel.
function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

// The headline number of a panel, in the same style as the Overview KPI cards.
function BigValue({ value, unit, size = "lg" }: { value: string; unit?: string; size?: "lg" | "md" }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1 tabular-nums">
      <span className={size === "lg" ? "text-3xl font-semibold" : "text-2xl font-semibold"}>{value}</span>
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
    </p>
  );
}

// Same pill style as the status column on the Meters list.
function StatusPill({ tone, children }: { tone: "live" | "stale"; children: React.ReactNode }) {
  const cls = tone === "live" ? "bg-success/10 text-success" : "bg-warning/10 text-warning";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

// Same sliding control as the Daily / Monthly / Quarterly / Yearly selector.
function TrendRangeSelector({ value, onChange }: { value: TrendDays; onChange: (value: TrendDays) => void }) {
  return (
    <div
      role="group"
      aria-label="History range"
      className="relative grid grid-cols-3 rounded-lg bg-secondary p-1 text-xs font-semibold"
    >
      <span
        className="absolute inset-y-1 w-1/3 rounded-md bg-card shadow-sm transition-transform duration-200"
        style={{ transform: `translateX(${TREND_OPTIONS.indexOf(value) * 100}%)` }}
      />
      {TREND_OPTIONS.map((days) => (
        <button
          key={days}
          type="button"
          aria-pressed={value === days}
          onClick={() => onChange(days)}
          className={cn(
            "relative z-10 rounded-md px-3 py-1.5 transition-colors",
            value === days ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {days}d
        </button>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MeterDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [deviceData, setDeviceData] = useState<{
    device: DeviceData;
    latestReading: LatestReading | null;
    todayVolumeDelta: number | null;
    todayUncorrectedVolumeDelta: number | null;
  } | null>(null);
  const [hourly, setHourly] = useState<HourlyData | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [consumption, setConsumption] = useState<ConsumptionBucket[]>([]);
  const [consumptionPeriod, setConsumptionPeriod] = useState<ConsumptionMode>("monthly");
  const [consumptionLoading, setConsumptionLoading] = useState(true);
  const [consumptionError, setConsumptionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendDays, setTrendDays] = useState<TrendDays>(30);
  const [showDeviceInfo, setShowDeviceInfo] = useState(false);

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [latestRes, hourlyRes] = await Promise.all([
        fetch(`/api/amr/meters/${id}/latest`),
        fetch(`/api/amr/meters/${id}/hourly`),
      ]);
      if (!latestRes.ok) throw new Error("Device not found");
      const latestJson = await latestRes.json();
      setDeviceData(latestJson);
      if (hourlyRes.ok) {
        setHourly(await hourlyRes.json());
      } else {
        setHourly(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load device");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id]);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/amr/meters/${id}/history?days=${trendDays}`);
    if (res.ok) {
      const data = await res.json();
      setHistory(data.history || []);
    }
  }, [id, trendDays]);

  const loadConsumption = useCallback(async () => {
    setConsumptionLoading(true);
    setConsumptionError(null);
    try {
      const response = await fetch(`/api/amr/meters/${id}/consumption?period=${consumptionPeriod}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to fetch consumption");
      setConsumption(result.consumption ?? []);
    } catch (error) {
      setConsumptionError(error instanceof Error ? error.message : "Failed to fetch consumption");
    } finally {
      setConsumptionLoading(false);
    }
  }, [id, consumptionPeriod]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData(true);
  }, [loadData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConsumption();
  }, [loadConsumption]);

  const hourlyPoints = hourly?.hourlyConsumption ?? [];
  // Timestamped points describe a gas day that crosses midnight; the rest belong to the reading's own day.
  const hourlyCrossesMidnight = hourlyPoints.some((point) => point.timestamp != null);

  const hourlyValueByDateAndHour = new Map(
    hourlyPoints.map((point) => {
      const timestampMatch = point.timestamp?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):/);
      const pointDate = timestampMatch?.[1] ?? hourly?.date;
      const pointHour = timestampMatch ? Number(timestampMatch[2]) : point.hour;
      return [`${pointDate}-${pointHour}`, point.value] as const;
    })
  );
  const previousHourlyDate = hourly?.date ? shiftDate(hourly.date, -1) : null;
  const hourlyChartData = Array.from({ length: HOURS_PER_DAY }, (_, index) => {
    const sourceHour = hourlyCrossesMidnight ? (index + HOURLY_WINDOW_START) % HOURS_PER_DAY : index;
    const sourceDate =
      hourlyCrossesMidnight && sourceHour >= HOURLY_WINDOW_START ? previousHourlyDate : hourly?.date;
    return {
      hour: `${String(sourceHour).padStart(2, "0")}:00`,
      value: sourceDate ? hourlyValueByDateAndHour.get(`${sourceDate}-${sourceHour}`) ?? 0 : 0,
    };
  });
  const hourlyTicks = hourlyCrossesMidnight ? HOURLY_WINDOW_TICKS : HOURLY_DAY_TICKS;
  const hasHourlyData = hourlyPoints.length > 0;

  const consumptionChartData = consumption.map((bucket) => ({ ...bucket, value: bucket.value ?? 0 }));
  const consumptionTicks = pickTicks(consumptionChartData.map((bucket) => bucket.label), tickCountForMode(consumptionPeriod));
  const hasConsumptionValues = consumption.length > 0;

  const staleDays = daysSince(deviceData?.device.lastSeenAt ?? null);
  const isStale = staleDays !== null && staleDays > 0;

  const chartData = useMemo(
    () =>
      history.map((h) => {
        const localStr = (h.timestamp || h.date || "").replace(/Z$/, "").replace(/\+00:00$/, "");
        const d = new Date(localStr);
        const hasTime = (h.timestamp || "").includes("T");
        let fullTimestamp = h.date;
        if (hasTime && !isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const hours = d.getHours();
          const minutes = String(d.getMinutes()).padStart(2, "0");
          const ampm = hours >= 12 ? "PM" : "AM";
          const formattedHours = String(hours % 12 || 12).padStart(2, "0");
          fullTimestamp = `${year}-${month}-${day} ${formattedHours}:${minutes} ${ampm}`;
        }

        const sameDayCount = history.filter((x) => x.date === h.date).length;
        const timeStr = !isNaN(d.getTime()) && hasTime
          ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
          : "";
        const label = sameDayCount > 1 && timeStr ? `${h.date} ${timeStr}` : h.date;
        return { ...h, label, fullTimestamp };
      }),
    [history]
  );

  // Tables of values for the Download button on each historical trend graph.
  const volumeTrendTable = useMemo(
    () => readingTrendTable(chartData.map((row) => ({ timestamp: row.fullTimestamp, value: row.correctedVolumeVb })), "Corrected volume (SCM)"),
    [chartData]
  );
  const pressureTrendTable = useMemo(
    () => readingTrendTable(chartData.map((row) => ({ timestamp: row.fullTimestamp, value: row.gasPressure })), "Gas pressure (barg)"),
    [chartData]
  );
  const temperatureTrendTable = useMemo(
    () => readingTrendTable(chartData.map((row) => ({ timestamp: row.fullTimestamp, value: row.gasTemperature })), "Gas temperature (°C)"),
    [chartData]
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl bg-muted/50 p-5">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-xl bg-muted/50 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !deviceData) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Link
            href="/amr/meters"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 text-muted-foreground")}
          >
            <ChevronLeft className="size-4" />
            Back to Meters
          </Link>
        </div>
        <DashboardPanel
          title="Could not load this meter"
          description="The meter may not exist, or its data is temporarily unavailable."
        >
          <p role="alert" className="text-sm text-destructive">
            {error ?? "Device not found."}
          </p>
        </DashboardPanel>
      </div>
    );
  }

  const { device, latestReading: r, todayVolumeDelta, todayUncorrectedVolumeDelta } = deviceData;

  const hourlyWindow =
    hourlyCrossesMidnight && previousHourlyDate && hourly?.date
      ? `${previousHourlyDate} 7:00 AM – ${hourly.date} 6:00 AM`
      : hourly?.date ?? null;

  return (
    <div className="flex flex-col gap-4">
      <ExportContextSetter context={`${device.customerName ?? "Unassigned"} · ${device.deviceSerialNo}`} />

      {/* ── Title ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/amr/meters"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-1 text-muted-foreground")}
          >
            <ChevronLeft className="size-4" />
            Meter Directory
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {device.deviceSerialNo}
            </h1>
            {isStale ? (
              <StatusPill tone="stale">
                <Clock className="size-3" />
                {staleDays}d old data
              </StatusPill>
            ) : (
              <StatusPill tone="live">
                <span className="size-1.5 animate-pulse rounded-full bg-current" />
                Live
              </StatusPill>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {device.customerName
              ? `${device.customerName} (${device.gaName || "Unknown GA"})`
              : "Unassigned"}
            {r ? ` · Last reading: ${formatLocalTs(r.readingDate)}` : " · No reading yet"}
          </p>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Latest readings, alarm limits and consumption history for this meter.
          </p>
        </div>
      </div>

      {/* ── Volume / Pressure / Temperature ────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <DashboardPanel
          title="Volume"
          description="Gas used today and the latest meter totals."
          action={<Activity className="size-4 text-muted-foreground" />}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Today corrected</p>
              <BigValue value={fmt(todayVolumeDelta)} unit="SCM" size="md" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Today uncorrected</p>
              <BigValue value={fmt(todayUncorrectedVolumeDelta)} unit="SCM" size="md" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Today&apos;s earliest value minus yesterday&apos;s earliest value</p>
          <div className="mt-3">
            <DataRow
              label="Corrected (Vb)"
              value={`${fmt(r?.correctedVolumeVb)} SCM`}
            />
            <DataRow
              label="Uncorrected (Vm)"
              value={`${fmt(r?.uncorrectedVolumeVm)} m³`}
            />
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Pressure"
          description="Latest gas pressure against this meter's alarm limits."
          action={<Gauge className="size-4 text-muted-foreground" />}
        >
          <BigValue value={fmt(r?.gasPressure)} unit="barg" />
          <div className="mt-3">
            <DataRow label="Current" value={`${fmt(r?.gasPressure)} barg`} />
            <DataRow label="Upper limit" value={device.pressureUpperLimit != null ? `${fmt(device.pressureUpperLimit)} barg` : "Not set"} />
            <DataRow label="Lower limit" value={device.pressureLowerLimit != null ? `${fmt(device.pressureLowerLimit)} barg` : "Not set"} />
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Temperature"
          description="Latest gas temperature against this meter's alarm limits."
          action={<Thermometer className="size-4 text-muted-foreground" />}
        >
          <BigValue value={fmt(r?.gasTemperature)} unit="°C" />
          <div className="mt-3">
            <DataRow label="Current" value={`${fmt(r?.gasTemperature)} °C`} />
            <DataRow label="Upper limit" value={device.temperatureUpperLimit != null ? `${fmt(device.temperatureUpperLimit)} °C` : "Not set"} />
            <DataRow label="Lower limit" value={device.temperatureLowerLimit != null ? `${fmt(device.temperatureLowerLimit)} °C` : "Not set"} />
          </div>
        </DashboardPanel>
      </div>

      {/* ── Gas properties / Meter info ────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        <DashboardPanel
          title="Gas properties"
          description="Compressibility and correction values from the latest reading."
          action={<Layers className="size-4 text-muted-foreground" />}
        >
          <DataRow label="Compressibility (Z)" value={fmt(r?.compressibilityZ, 4)} />
          <DataRow label="Compressibility (Fpv)" value={fmt(r?.compressibilityFpv, 4)} />
          <DataRow label="Correction factor (C)" value={fmt(r?.correctionFactorC, 4)} />
        </DashboardPanel>

        <DashboardPanel
          title="Meter info"
          description="Meter identity, battery level and when it last reported."
          action={<Info className="size-4 text-muted-foreground" />}
        >
          <DataRow label="Meter serial" value={device.meterSerialNo ?? "—"} />
          <DataRow label="Meter size" value={device.meterSize ?? "—"} />
          <DataRow
            label="Battery"
            value={r?.batteryLevel != null ? `${Math.round(r.batteryLevel)}%` : "—"}
          />
          <DataRow
            label="Low battery limit"
            value={device.batteryLowerLimit != null ? `${fmt(device.batteryLowerLimit)}%` : "Not set"}
          />
          <DataRow
            label="Last seen"
            value={formatLocalTs(device.lastSeenAt)}
          />
        </DashboardPanel>
      </div>

      {/* ── Hourly consumption ─────────────────────────────────────────── */}
      <DashboardPanel
        title="Hourly consumption"
        description={
          hourlyWindow
            ? `Gas used in each hour, in SCM · ${hourlyWindow}`
            : "Gas used in each hour of the latest reported day, in SCM"
        }
        action={
          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            SCM / hour
          </span>
        }
      >
        {hasHourlyData ? (
          <ConsumptionAreaChart
            data={hourlyChartData.map((item) => ({ label: item.hour, value: item.value }))}
            categoryLabel="Hour"
            seriesLabel="Hourly consumption"
            ticks={hourlyTicks}
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No hourly data for this reading.
          </div>
        )}
      </DashboardPanel>

      {/* ── Consumption (corrected) ────────────────────────────────────── */}
      <DashboardPanel
        title="Consumption (corrected)"
        description="Corrected volume used in each period, worked out from the difference between readings."
        action={<PeriodSelector value={consumptionPeriod} onChange={setConsumptionPeriod} />}
      >
        {consumptionLoading ? (
          <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading consumption…
          </div>
        ) : consumptionError ? (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">{consumptionError}</div>
        ) : !hasConsumptionValues ? (
          <div className="flex h-64 items-center justify-center text-center text-sm text-muted-foreground">No consumption change is available for this period. This meter needs readings from both the start and end of a period to calculate a delta.</div>
        ) : (
          <ConsumptionAreaChart
            data={consumptionChartData}
            categoryLabel="Period"
            seriesLabel="Corrected consumption"
            ticks={consumptionTicks}
          />
        )}
        {consumption.some((bucket) => bucket.suspect) && <p className="mt-3 text-xs text-destructive">Red dots indicate a meter reset was detected for that period.</p>}
      </DashboardPanel>

      {/* ── Historical trends ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Historical trends</h2>
          <p className="text-sm text-muted-foreground">
            Corrected volume, pressure and temperature readings over the last {trendDays} days.
          </p>
        </div>
        <TrendRangeSelector value={trendDays} onChange={setTrendDays} />
      </div>

      {history.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl bg-muted/50 text-sm text-muted-foreground">
          No history data available for this range.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <DashboardPanel title="Corrected volume (SCM)" description="Corrected volume reading (Vb) over time.">
            <ChartExportData table={volumeTrendTable} />
            <ChartContainer
              config={{ correctedVolumeVb: { label: "Corrected Vol", color: "var(--chart-2)" } }}
              className="aspect-auto h-48 w-full"
            >
              <AreaChart data={chartData} accessibilityLayer>
                <defs>
                  <linearGradient id="fillCorrectedVol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-correctedVolumeVb)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--color-correctedVolumeVb)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  interval="preserveStartEnd"
                />
                <YAxis tickLine={false} axisLine={false} width={56} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTimestamp || _} />} />
                <Area
                  type="monotone"
                  dataKey="correctedVolumeVb"
                  stroke="var(--color-correctedVolumeVb)"
                  strokeWidth={2}
                  fill="url(#fillCorrectedVol)"
                  dot={false}
                  activeDot={{ r: 4 }}
                  name="Corrected Vol"
                  connectNulls
                />
              </AreaChart>
            </ChartContainer>
          </DashboardPanel>

          <DashboardPanel title="Gas pressure (barg)" description="Gas pressure reading over time.">
            <ChartExportData table={pressureTrendTable} />
            <ChartContainer
              config={{ gasPressure: { label: "Pressure", color: CHART_COLORS.primary } }}
              className="aspect-auto h-48 w-full"
            >
              <AreaChart data={chartData} accessibilityLayer>
                <defs>
                  <linearGradient id="fillPressure" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-gasPressure)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--color-gasPressure)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  interval="preserveStartEnd"
                />
                <YAxis tickLine={false} axisLine={false} width={44} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTimestamp || _} />} />
                <Area
                  type="monotone"
                  dataKey="gasPressure"
                  stroke="var(--color-gasPressure)"
                  strokeWidth={2}
                  fill="url(#fillPressure)"
                  dot={false}
                  name="Pressure"
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              </AreaChart>
            </ChartContainer>
          </DashboardPanel>

          <DashboardPanel title="Gas temperature (°C)" description="Gas temperature reading over time.">
            <ChartExportData table={temperatureTrendTable} />
            <ChartContainer
              config={{ gasTemperature: { label: "Temperature", color: CHART_COLORS.warning } }}
              className="aspect-auto h-48 w-full"
            >
              <AreaChart data={chartData} accessibilityLayer>
                <defs>
                  <linearGradient id="fillTemperature" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-gasTemperature)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--color-gasTemperature)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  interval="preserveStartEnd"
                />
                <YAxis tickLine={false} axisLine={false} width={44} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTimestamp || _} />} />
                <Area
                  type="monotone"
                  dataKey="gasTemperature"
                  stroke="var(--color-gasTemperature)"
                  strokeWidth={2}
                  fill="url(#fillTemperature)"
                  dot={false}
                  name="Temperature"
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              </AreaChart>
            </ChartContainer>
          </DashboardPanel>
        </div>
      )}

      {/* ── Device information (collapsible) ───────────────────────────── */}
      <section className="rounded-xl bg-muted/50 p-5">
        <button
          type="button"
          onClick={() => setShowDeviceInfo((v) => !v)}
          aria-expanded={showDeviceInfo}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <span>
            <span className="block text-base font-medium">Device information</span>
            <span className="block text-sm text-muted-foreground">
              Model, firmware and registration details for this device.
            </span>
          </span>
          {showDeviceInfo ? (
            <ChevronUp className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {showDeviceInfo && (
          <div className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <DataRow label="Device serial" value={device.deviceSerialNo} />
            <DataRow label="Device model" value={device.deviceModel ?? "—"} />
            <DataRow
              label="Firmware version"
              value={device.firmwareVersion ?? "—"}
            />
            <DataRow
              label="Hardware version"
              value={device.hardwareVersion ?? "—"}
            />
            <DataRow
              label="Config version"
              value={device.configurationVersion ?? "—"}
            />
            <DataRow label="Customer" value={device.customerName ?? "—"} />
            <DataRow label="Geographical area" value={device.gaName ?? "—"} />
          </div>
        )}
      </section>
    </div>
  );
}

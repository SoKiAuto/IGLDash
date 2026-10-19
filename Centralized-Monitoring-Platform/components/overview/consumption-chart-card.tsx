"use client"

import { useCallback, useEffect, useState } from "react"
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { RefreshCw } from "lucide-react"

import { DashboardPanel } from "@/components/dashboard-panel"
import { PeriodSelector } from "@/components/ui/period-selector"
import type { ConsumptionMode } from "@/lib/consumption-series"

interface ConsumptionPoint {
  label: string
  cngValue?: number | null
  pngValue?: number | null
  value?: number | null
  suspect?: boolean
}

export function ConsumptionChartCard() {
  const [period, setPeriod] = useState<ConsumptionMode>("daily")
  const [data, setData] = useState<ConsumptionPoint[]>([])
  const [loading, setLoading] = useState(true)

  const loadConsumption = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/amr/overview/consumption?period=${period}`)
      if (res.ok) {
        const json = await res.json()
        setData(json.consumption ?? [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    loadConsumption()
  }, [loadConsumption])

  const chartData = data.map((d) => ({
    label: d.label,
    cng: d.cngValue !== null && d.cngValue !== undefined ? Number(d.cngValue) : 0,
    png: d.pngValue !== null && d.pngValue !== undefined ? Number(d.pngValue) : 0,
    suspect: d.suspect ?? false,
  }))

  const hasData = chartData.some((d) => d.cng > 0 || d.png > 0)

  return (
    <DashboardPanel
      title="Consumption"
      description="Total volume breakdown across CNG and PNG consumers"
      action={<PeriodSelector value={period} onChange={setPeriod} />}
    >
      <div className="h-80 w-full pt-2">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground gap-2">
            <RefreshCw className="size-4 animate-spin text-primary" />
            Loading consumption series...
          </div>
        ) : !hasData ? (
          <div className="flex h-full flex-col items-center justify-center text-xs text-muted-foreground">
            <p>No consumption readings recorded for this period.</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              Select another time period above to view consumption trends.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-muted-foreground"
                axisLine={{ stroke: "currentColor", opacity: 0.2 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-muted-foreground"
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `${val.toLocaleString()}`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="rounded-lg border border-border bg-popover p-2.5 text-xs shadow-md space-y-1.5 text-popover-foreground">
                      <div className="font-semibold">{label}</div>
                      {payload.map((p) => (
                        <div key={p.name} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                            <span className="text-muted-foreground">{p.name}:</span>
                          </div>
                          <span className="font-mono font-medium">
                            {Number(p.value).toLocaleString()} SCM
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                }}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ paddingTop: "14px", fontSize: "12px" }}
                formatter={(val) => <span className="text-muted-foreground font-medium">{val}</span>}
              />
              <Bar
                name="CNG Consumption"
                dataKey="cng"
                fill="#b85d75"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                name="PNG Consumption"
                dataKey="png"
                fill="#d87f95"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </DashboardPanel>
  )
}

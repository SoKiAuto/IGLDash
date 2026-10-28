"use client"

import { useId, useMemo } from "react"
import { Area, AreaChart, CartesianGrid, ReferenceDot, XAxis, YAxis } from "recharts"

import { useChartExport } from "@/components/export/chart-export-provider"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { consumptionTable } from "@/lib/export/chart-table"

export type ConsumptionAreaPoint = {
  label: string
  value: number
  // Draws a red dot on the point, used when a meter reset was detected for that period.
  suspect?: boolean
}

type ConsumptionAreaChartProps = {
  data: ConsumptionAreaPoint[]
  // Heading of the first column in the downloaded table, for example "Hour" or "Period".
  categoryLabel: string
  // X-axis labels to show. Leave out to let the chart choose.
  ticks?: string[]
  // Name shown in the tooltip, for example "Consumption".
  seriesLabel?: string
  color?: string
}

// Gradient area chart in the same style as "Compressor utilization per day".
export function ConsumptionAreaChart({
  data,
  categoryLabel,
  ticks,
  seriesLabel = "Consumption",
  color = "var(--chart-2)",
}: ConsumptionAreaChartProps) {
  // Each chart on a page needs its own gradient id. useId contains colons, which break url(#id).
  const gradientId = `consumptionFill-${useId().replace(/:/g, "")}`
  const chartConfig = { value: { label: seriesLabel, color } } satisfies ChartConfig
  const chartData = data.map((point, index) => ({
    ...point,
    chartKey: `point-${index}`,
  }))
  const chartLabelByKey = new Map(
    chartData.map((point) => [point.chartKey, point.label])
  )
  const chartTicks = ticks
    ? [...new Set(
        ticks
          .map((tick) => data.findIndex((point) => point.label === tick))
          .filter((index) => index >= 0)
          .map((index) => chartData[index].chartKey)
      )]
    : undefined

  // Hands the values to the card's Download button.
  const table = useMemo(
    () => consumptionTable(data, { category: categoryLabel, series: seriesLabel }),
    [data, categoryLabel, seriesLabel]
  )
  useChartExport(table)

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={chartData} accessibilityLayer>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="chartKey"
          ticks={chartTicks}
          tickFormatter={(key: string) => chartLabelByKey.get(key) ?? ""}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis tickLine={false} axisLine={false} width="auto" domain={[0, "auto"]} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(key) =>
                chartLabelByKey.get(String(key)) ?? String(key)
              }
            />
          }
        />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4 }}
        />
        {chartData
          .filter((point) => point.suspect)
          .map((point) => (
            <ReferenceDot
              key={point.chartKey}
              x={point.chartKey}
              y={point.value}
              r={4}
              fill="var(--destructive)"
              stroke="none"
            />
          ))}
      </AreaChart>
    </ChartContainer>
  )
}
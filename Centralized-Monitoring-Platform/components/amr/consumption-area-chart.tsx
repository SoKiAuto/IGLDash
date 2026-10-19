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
  const suspectPoints = data.filter((point) => point.suspect)

  // Hands the values to the card's Download button.
  const table = useMemo(
    () => consumptionTable(data, { category: categoryLabel, series: seriesLabel }),
    [data, categoryLabel, seriesLabel]
  )
  useChartExport(table)

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={data} accessibilityLayer>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          ticks={ticks}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis tickLine={false} axisLine={false} width="auto" domain={[0, "auto"]} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4 }}
        />
        {suspectPoints.map((point) => (
          <ReferenceDot
            key={point.label}
            x={point.label}
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
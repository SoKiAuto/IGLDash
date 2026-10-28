import type { ReactNode } from "react"

import { StatusBadge } from "@/components/overview/status-badge"

export type Metric = {
  label: string
  value: string
  unit?: string
  change?: ReactNode
  note?: string
  supportingMetrics?: { label: string; value: string; note: string }[]
  detail?: string
  badge?: { text: string; tone: "good" | "warning" | "neutral" }
}

export function KpiStrip({
  metrics,
  featuredMetric,
  featuredCompanionMetric,
}: {
  metrics: Metric[]
  featuredMetric?: string
  featuredCompanionMetric?: string
}) {
  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${
        featuredMetric ? "xl:grid-cols-4 xl:auto-rows-fr" : "2xl:grid-cols-6"
      }`}
    >
      {metrics.map((metric) => {
        const isFeatured = metric.label === featuredMetric
        const isFeaturedCompanion = metric.label === featuredCompanionMetric
        return (
          <div
            key={metric.label}
            className={`flex flex-col gap-1 rounded-xl bg-muted/50 p-4 ${
              isFeatured
                ? "xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:justify-between"
                : isFeaturedCompanion
                  ? "xl:col-start-4 xl:row-start-1"
                  : ""
            }`}
          >
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <p className="tabular-nums">
              <span className="text-3xl font-semibold">{metric.value}</span>
              {metric.unit && (
                <span className="ml-1 text-sm text-muted-foreground">{metric.unit}</span>
              )}
            </p>
            {metric.change}
            {metric.note && (
              <p className="text-xs text-muted-foreground">{metric.note}</p>
            )}
            {metric.supportingMetrics && (
              <dl className="mt-3 grid gap-3 border-t border-border/70 pt-3">
                {metric.supportingMetrics.map((supportingMetric) => (
                  <div
                    key={supportingMetric.label}
                    className="flex items-start justify-between gap-3"
                  >
                    <div>
                      <dt className="text-sm text-muted-foreground">
                        {supportingMetric.label}
                      </dt>
                      <dd className="mt-0.5 text-xs text-muted-foreground">
                        {supportingMetric.note}
                      </dd>
                    </div>
                    <dd className="shrink-0 text-sm font-semibold tabular-nums">
                      {supportingMetric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {metric.detail && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {metric.detail}
              </p>
            )}
            {metric.badge && (
              <div className="mt-1">
                <StatusBadge tone={metric.badge.tone}>{metric.badge.text}</StatusBadge>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

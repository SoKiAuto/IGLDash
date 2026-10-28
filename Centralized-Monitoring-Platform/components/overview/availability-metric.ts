// Shared Availability KPI used by Overview and Station uptime.
import type { Metric } from "@/components/overview/kpi-strip"
import { formatInteger, formatPercent } from "@/lib/format"

export function buildAvailabilityMetric(params: {
  availabilityPercent: number | null
  compressorAvailabilityPercent: number | null
  knownCompressorHours: number | null
  observedHours: number | null
  openHours: number | null
  coveragePercent: number | null
}): Metric {
  const {
    availabilityPercent,
    compressorAvailabilityPercent,
    knownCompressorHours,
    observedHours,
    openHours,
    coveragePercent,
  } = params

  return {
    label: "Availability",
    value: availabilityPercent === null ? "--" : formatPercent(availabilityPercent),
    supportingMetrics: [
      {
        label: "Compressor availability",
        value:
          compressorAvailabilityPercent === null
            ? "--"
            : formatPercent(compressorAvailabilityPercent),
        note:
          knownCompressorHours === null
            ? "Compressor status data unavailable"
            : `${formatInteger(knownCompressorHours)} hours with known status`,
      },
      {
        label: "Dispenser availability",
        value: "Not measured",
        note: "Fill records confirm operation; idle status is unknown",
      },
    ],
    detail:
      coveragePercent === null || observedHours === null || openHours === null
        ? "Combined availability requires both a dispenser fill signal and a known compressor status."
        : `${formatInteger(observedHours)} of ${formatInteger(openHours)} station-open hours had both signals (${formatPercent(coveragePercent)} coverage). The combined rate counts those hours when the compressor was up.`,
  }
}

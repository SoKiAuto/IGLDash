// Estimates rated compressor flow from the equipment identifiers available in readings.
export type RatedCompressorFlow = {
  capacity: number
  basis: "equipment tag" | "ICL make estimate"
}

const FLOW_CAPACITY_TAGS = [
  { suffix: "TULIP600M", capacity: 600 },
  { suffix: "1200", capacity: 1200 },
] as const

export function getRatedCompressorFlow(unit: string): RatedCompressorFlow | null {
  const equipmentName = unit.split("|")[1]?.trim().toUpperCase() ?? ""
  const tag = FLOW_CAPACITY_TAGS.find(({ suffix }) => equipmentName.endsWith(suffix))

  if (tag) return { capacity: tag.capacity, basis: "equipment tag" }

  // ICL units in this project omit the model suffix; use the common 450 SCMH ICL package as an estimate.
  if (equipmentName.endsWith("ICL")) {
    return { capacity: 450, basis: "ICL make estimate" }
  }

  return null
}

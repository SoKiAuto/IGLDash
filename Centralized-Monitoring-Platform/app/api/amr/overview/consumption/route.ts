import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchFleetConsumptionSeries } from "@/lib/amr-db"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url)
    const period = searchParams.get("period") || "daily"
    const consumption = await fetchFleetConsumptionSeries(period)
    return NextResponse.json({ consumption })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load consumption series"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

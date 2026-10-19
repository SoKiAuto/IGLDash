import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchMeterHourly } from "@/lib/amr-db"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params
    const hourly = await fetchMeterHourly(id)
    return NextResponse.json(hourly)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load hourly readings"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

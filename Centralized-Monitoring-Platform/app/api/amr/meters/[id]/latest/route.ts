import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchMeterDetails } from "@/lib/amr-db"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params
    const details = await fetchMeterDetails(id)
    if (!details) return NextResponse.json({ error: "Device not found" }, { status: 404 })
    return NextResponse.json(details)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load meter details"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

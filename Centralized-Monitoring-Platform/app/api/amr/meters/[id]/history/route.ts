import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchMeterHistory } from "@/lib/amr-db"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get("days") || "30", 10)
    const history = await fetchMeterHistory(id, days)
    return NextResponse.json({ history })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load meter history"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

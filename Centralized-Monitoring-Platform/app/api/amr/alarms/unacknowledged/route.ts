import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchUnacknowledgedAlarms } from "@/lib/amr-db"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const items = await fetchUnacknowledgedAlarms()
    return NextResponse.json({ items })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load unacknowledged alarms"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

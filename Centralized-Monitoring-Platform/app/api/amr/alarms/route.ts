import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchAmrAlarms } from "@/lib/amr-db"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "20", 10)
    const status = searchParams.get("status") || undefined
    const severity = searchParams.get("severity") || undefined
    const type = searchParams.get("type") || undefined
    const search = searchParams.get("search") || undefined
    const ackParam = searchParams.get("acknowledged")
    const acknowledged = ackParam === "true" ? true : ackParam === "false" ? false : undefined

    const result = await fetchAmrAlarms({ page, limit, status, severity, type, search, acknowledged })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load alarms"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

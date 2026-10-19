import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchAmrDevices } from "@/lib/amr-db"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "20", 10)
    const search = searchParams.get("search") || undefined
    const status = searchParams.get("status") || undefined
    // Unknown values fall back to the default order inside fetchAmrDevices.
    const sortBy = searchParams.get("sortBy") || undefined
    const sortDirection = searchParams.get("sortDirection") || undefined

    const result = await fetchAmrDevices({ page, limit, search, status, sortBy, sortDirection })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load devices"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
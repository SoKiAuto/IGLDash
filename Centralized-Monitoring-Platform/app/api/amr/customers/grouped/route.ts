import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchAmrCustomersGrouped } from "@/lib/amr-db"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "10", 10)
    const search = searchParams.get("search") || undefined
    const status = searchParams.get("status") || undefined
    const category = searchParams.get("category") || undefined
    const city = searchParams.get("city") || undefined

    const result = await fetchAmrCustomersGrouped({ page, limit, search, status, category, city })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load grouped customers"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

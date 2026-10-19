import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchAmrCustomers } from "@/lib/amr-db"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "25", 10)
    const search = searchParams.get("search") || undefined

    const result = await fetchAmrCustomers({ page, limit, search })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load customers"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

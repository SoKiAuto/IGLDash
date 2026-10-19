import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchAmrOverview } from "@/lib/amr-db"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const overview = await fetchAmrOverview()
    return NextResponse.json(overview)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load AMR overview"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

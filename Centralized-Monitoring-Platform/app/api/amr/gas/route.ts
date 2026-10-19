import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchGasList } from "@/lib/amr-db"

export async function GET() {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const gas = await fetchGasList()
    return NextResponse.json(gas)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load GAs"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

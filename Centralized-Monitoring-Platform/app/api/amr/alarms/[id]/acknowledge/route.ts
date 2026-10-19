import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { acknowledgeAmrAlarm } from "@/lib/amr-db"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params
    const success = await acknowledgeAmrAlarm(id)
    return NextResponse.json({ success, id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to acknowledge alarm"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

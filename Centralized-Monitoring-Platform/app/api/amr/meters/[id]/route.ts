import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { updateDeviceThresholds } from "@/lib/amr-db"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params
    const body = await req.json()
    const ok = await updateDeviceThresholds(id, body)
    return NextResponse.json({ success: ok })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update device"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

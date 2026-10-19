import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { fetchGasList, createGeographicalArea } from "@/lib/amr-db"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const gas = await fetchGasList()
    return NextResponse.json(gas)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load GAs"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const ga = await createGeographicalArea({
      name: body.name.trim(),
      code: body.code ? String(body.code).trim() : null,
      parentId: body.parentId ? String(body.parentId).trim() : null,
    })

    return NextResponse.json(ga, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create geographical area"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

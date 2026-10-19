import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { updateGeographicalArea, deleteGeographicalArea } from "@/lib/amr-db"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const body = await req.json()

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const ga = await updateGeographicalArea(id, {
      name: body.name.trim(),
      code: body.code ? String(body.code).trim() : null,
    })

    if (!ga) {
      return NextResponse.json({ error: "Geographical area not found" }, { status: 404 })
    }

    return NextResponse.json(ga)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update geographical area"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const result = await deleteGeographicalArea(id)

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Failed to delete" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete geographical area"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

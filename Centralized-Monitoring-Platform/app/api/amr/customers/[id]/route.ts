import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import {
  fetchAmrCustomerById,
  updateAmrCustomer,
} from "@/lib/amr-db"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const customer = await fetchAmrCustomerById(id)
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })

    return NextResponse.json(customer)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load customer"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body: unknown = await request.json()
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 })
    }

    const { name, gaId, address } = body as Record<string, unknown>
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    if (typeof gaId !== "string" || !gaId.trim()) {
      return NextResponse.json(
        { error: "Geographical area (City) is required" },
        { status: 400 }
      )
    }
    if (address !== undefined && address !== null && typeof address !== "string") {
      return NextResponse.json({ error: "Address must be a string" }, { status: 400 })
    }

    const { id } = await params
    const customer = await updateAmrCustomer(id, {
      name,
      gaId: gaId.trim(),
      address: typeof address === "string" ? address : null,
    })
    if (!customer) {
      return NextResponse.json(
        { error: "Customer or geographical area not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(customer)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update customer"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

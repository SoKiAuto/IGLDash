import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { createAmrCustomer, fetchAmrCustomers } from "@/lib/amr-db"

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

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body: unknown = await req.json()
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 })
    }

    const { name, gaId, address } = body as Record<string, unknown>
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    if (typeof gaId !== "string" || !gaId.trim()) {
      return NextResponse.json({ error: "Geographical area (City) is required" }, { status: 400 })
    }
    if (address !== undefined && address !== null && typeof address !== "string") {
      return NextResponse.json({ error: "Address must be a string" }, { status: 400 })
    }

    const customer = await createAmrCustomer({
      name: name.trim(),
      gaId: gaId.trim(),
      address: typeof address === "string" ? address : null,
    })
    return NextResponse.json(customer, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create customer"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

"use client"

import { useEffect, useState, useCallback } from "react"
import { Globe, Plus, RefreshCw, Pencil, Trash2, Check, X, AlertTriangle, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export interface GeographicalAreaOption {
  id: string
  name: string
  code: string | null
  createdAt?: string
  customerCount?: number
}

export function GaManagementCard() {
  const [areas, setAreas] = useState<GeographicalAreaOption[]>([])
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null)

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editCode, setEditCode] = useState("")
  const [updating, setUpdating] = useState(false)

  // Deleting state
  const [deletingArea, setDeletingArea] = useState<GeographicalAreaOption | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadAreas = useCallback(async () => {
    try {
      const response = await fetch("/api/amr/gas", { cache: "no-store" })
      if (!response.ok) throw new Error("Unable to load geographical areas.")
      const data = await response.json()
      setAreas(data)
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Failed to load geographical areas.",
        type: "error",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAreas()
  }, [loadAreas])

  async function createArea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/amr/gas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), code: code.trim() || null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to create geographical area.")

      setName("")
      setCode("")
      setMessage({ text: `Geographical area "${data.name}" created successfully.`, type: "success" })
      await loadAreas()
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Failed to create geographical area.",
        type: "error",
      })
    } finally {
      setSaving(false)
    }
  }

  function startEdit(area: GeographicalAreaOption) {
    setEditingId(area.id)
    setEditName(area.name)
    setEditCode(area.code ?? "")
    setMessage(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName("")
    setEditCode("")
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return

    setUpdating(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/amr/gas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), code: editCode.trim() || null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to update geographical area.")

      setMessage({ text: `Geographical area "${data.name}" updated.`, type: "success" })
      setEditingId(null)
      await loadAreas()
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Failed to update geographical area.",
        type: "error",
      })
    } finally {
      setUpdating(false)
    }
  }

  async function confirmDelete() {
    if (!deletingArea) return

    setDeleting(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/amr/gas/${deletingArea.id}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to delete geographical area.")

      setMessage({ text: `Geographical area "${deletingArea.name}" deleted.`, type: "success" })
      setDeletingArea(null)
      await loadAreas()
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Failed to delete geographical area.",
        type: "error",
      })
      setDeletingArea(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Geographical Areas (GA)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Define and manage geographical territories used for organizing AMR meters and customer accounts.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true)
              loadAreas()
            }}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>

        <CardContent className="pt-5 space-y-6">
          {/* Create GA Form */}
          <form onSubmit={createArea} className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <Plus className="size-4 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Add New Geographical Area
              </h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="ga-name" className="text-xs font-medium text-foreground">
                  GA Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="ga-name"
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. North Region, Sector 62, Central Zone"
                  required
                  className="bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ga-code" className="text-xs font-medium text-foreground">
                  GA Code <span className="text-xs text-muted-foreground">(Optional)</span>
                </label>
                <Input
                  id="ga-code"
                  maxLength={40}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="e.g. GA-NORTH, SEC-62"
                  className="font-mono bg-background"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Areas created here will be immediately available in customer provisioning and meter filters.
              </p>
              <Button type="submit" disabled={saving || !name.trim()} size="sm" className="h-8 px-4 text-xs font-medium">
                {saving ? "Creating…" : "Create GA"}
              </Button>
            </div>
          </form>

          {/* Feedback Message Alert */}
          {message && (
            <div
              role="alert"
              className={`flex items-center justify-between rounded-lg px-4 py-3 text-xs font-medium ${
                message.type === "success"
                  ? "bg-success/10 text-success border border-success/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}
            >
              <span>{message.text}</span>
              <button
                type="button"
                onClick={() => setMessage(null)}
                className="text-current opacity-70 hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* Existing Geographical Areas List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Configured Geographical Areas ({areas.length})
              </p>
            </div>

            {loading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-11 animate-pulse rounded-md bg-muted/40" />
                ))}
              </div>
            ) : areas.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                <Globe className="mx-auto mb-2 size-6 text-muted-foreground/50" />
                <p className="font-medium text-foreground">No geographical areas created yet.</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use the form above to add your first geographical area.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border bg-background overflow-hidden">
                {areas.map((area) => {
                  const isEditing = editingId === area.id

                  if (isEditing) {
                    return (
                      <div key={area.id} className="flex flex-wrap items-center gap-2 p-3 bg-muted/30">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="GA Name"
                          className="h-8 min-w-44 flex-1 text-sm bg-background"
                          required
                          autoFocus
                        />
                        <Input
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value)}
                          placeholder="GA Code (optional)"
                          className="h-8 w-36 font-mono text-sm bg-background"
                        />
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 px-2.5 text-xs"
                            disabled={updating || !editName.trim()}
                            onClick={() => saveEdit(area.id)}
                          >
                            <Check className="size-3.5 mr-1" />
                            {updating ? "Saving…" : "Save"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-muted-foreground"
                            disabled={updating}
                            onClick={cancelEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={area.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-medium text-sm text-foreground truncate">
                          {area.name}
                        </span>
                        {area.code && (
                          <Badge variant="outline" className="font-mono text-[11px] font-normal">
                            {area.code}
                          </Badge>
                        )}
                        {typeof area.customerCount === "number" && area.customerCount > 0 && (
                          <Badge variant="secondary" className="gap-1 text-[10px] font-normal text-muted-foreground">
                            <Users className="size-2.5" />
                            {area.customerCount} {area.customerCount === 1 ? "customer" : "customers"}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          title="Edit GA"
                          onClick={() => startEdit(area)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          title="Delete GA"
                          onClick={() => setDeletingArea(area)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
      {deletingArea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in-50">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Delete Geographical Area?</h3>
                <p className="text-xs text-muted-foreground">
                  Are you sure you want to delete <span className="font-semibold text-foreground">{deletingArea.name}</span>?
                  This action cannot be undone.
                </p>
                {typeof deletingArea.customerCount === "number" && deletingArea.customerCount > 0 && (
                  <p className="text-xs font-medium text-destructive pt-1">
                    Warning: This area currently has {deletingArea.customerCount} assigned customer(s).
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deleting}
                onClick={() => setDeletingArea(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deleting}
                onClick={confirmDelete}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

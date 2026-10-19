"use client"

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { TableHead } from "@/components/ui/table"

export type SortDirection = "asc" | "desc"

export type ServerSortState<Key extends string> = { key: Key; direction: SortDirection } | null

// Same cycle as SortableTable: first click ascending, second descending, third back to the default order.
export function nextSortState<Key extends string>(
  current: ServerSortState<Key>,
  key: Key
): ServerSortState<Key> {
  if (current?.key !== key) return { key, direction: "asc" }
  if (current.direction === "asc") return { key, direction: "desc" }
  return null
}

type SortableColumnHeadProps<Key extends string> = {
  label: string
  columnKey: Key
  sort: ServerSortState<Key>
  onSortChange: (next: ServerSortState<Key>) => void
}

// A table heading whose sorting is done by the server, for tables that are paginated on the server.
export function SortableColumnHead<Key extends string>({
  label,
  columnKey,
  sort,
  onSortChange,
}: SortableColumnHeadProps<Key>) {
  const isActive = sort?.key === columnKey
  const Icon = !isActive ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown

  return (
    <TableHead aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSortChange(nextSortState(sort, columnKey))}
        className={`inline-flex items-center gap-1 rounded transition-colors hover:text-foreground ${
          isActive ? "text-foreground" : ""
        }`}
      >
        {label}
        <Icon className={`size-3.5 ${isActive ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  )
}
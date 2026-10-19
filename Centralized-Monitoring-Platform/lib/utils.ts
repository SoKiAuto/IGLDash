export { cn } from "cn"

export function formatLocalTs(isoStr: string | null | undefined): string {
  if (!isoStr) return "--"
  const localStr = isoStr.replace(/Z$/, "").replace(/\+00:00$/, "")
  const d = new Date(localStr)
  if (isNaN(d.getTime())) return "--"
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  let hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12
  const strHours = String(hours).padStart(2, "0")
  return `${day}/${month}/${year}, ${strHours}:${minutes} ${ampm}`
}

export function formatLocalDate(isoStr: string | null | undefined): string {
  if (!isoStr) return "--"
  const localStr = isoStr.replace(/Z$/, "").replace(/\+00:00$/, "")
  const d = new Date(localStr)
  if (isNaN(d.getTime())) return "--"
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

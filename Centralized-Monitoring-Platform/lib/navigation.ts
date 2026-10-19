import {
  Activity,
  Car,
  Fuel,
  LayoutDashboard,
  Gauge,
  Gauge as GaugeMeter,
  MapPin,
  Zap,
  type LucideIcon,
  Flame,
} from "lucide-react"

export type NavigationLink = {
  title: string
  href: string
}

export type NavigationItem = NavigationLink & { icon: LucideIcon }

export type NavigationGroup = {
  title: string
  icon: LucideIcon
  children: NavigationLink[]
}

export type NavigationEntry = NavigationItem | NavigationGroup

export function isNavigationGroup(entry: NavigationEntry): entry is NavigationGroup {
  return "children" in entry
}

export const MONITORING_ITEMS: NavigationEntry[] = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "Map view", href: "/map", icon: MapPin },
  { title: "Daily vehicles", href: "/vehicles", icon: Car },
  { title: "Full-fill rate", href: "/full-fill", icon: Fuel },
  { title: "Station uptime", href: "/uptime", icon: Activity },
  {
    title: "Outages",
    icon: Zap,
    children: [
      { title: "Power outages", href: "/power" },
      { title: "Gas outages", href: "/gas-outage" },
    ],
  },
  {
    title: "Utilization",
    icon: Gauge,
    children: [
      { title: "Dispenser utilization", href: "/capacity" },
      { title: "Compressor utilization", href: "/compressor-utilization" },
    ],
  },
]

export const AMR_ITEMS: NavigationEntry[] = [
  { title: "Meters", href: "/amr/meters", icon: Flame },
]

export type NavigationSection = {
  label: string
  items: NavigationEntry[]
}

export const NAVIGATION_SECTIONS: NavigationSection[] = [
  { label: "Monitoring", items: MONITORING_ITEMS },
  { label: "AMR", items: AMR_ITEMS },
]

export const NAVIGATION_ITEMS: NavigationEntry[] = [
  ...MONITORING_ITEMS,
  ...AMR_ITEMS,
]

export const FLAT_NAVIGATION_LINKS: NavigationLink[] = NAVIGATION_ITEMS.flatMap(
  (entry) => (isNavigationGroup(entry) ? entry.children : [entry])
)

export function isActiveNavigationItem(pathname: string, item: NavigationLink) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

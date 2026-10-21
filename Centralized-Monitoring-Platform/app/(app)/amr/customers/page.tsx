"use client"

import { useCallback, useEffect, useState, Fragment } from "react"
import Link from "next/link"
import {
  ChevronDown,
  ChevronRight,
  Flame,
  Loader2,
  Pencil,
  PlusCircle,
  Search,
  Unlink,
  WifiOff,
  X,
  Check,
} from "lucide-react"

import { DashboardPanel } from "@/components/dashboard-panel"
import { StatusBadge } from "@/components/overview/status-badge"
import { SortableColumnHead, type ServerSortState } from "@/components/sortable-column-head"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { parseAndValidateThresholdInputs } from "@/lib/device-field-parse"
import {
  ThresholdCardSet,
  emptyThresholdFormValues,
  thresholdFormFromDevice,
  type ThresholdFormValues,
} from "@/components/devices/threshold-card-set"

interface DeviceItem {
  id: string
  deviceSerialNo: string
  meterSerialNo: string | null
  meterSize: string | null
  firmwareVersion: string | null
  hardwareVersion: string | null
  deviceModel: string | null
  configurationVersion: string | null
  latitude: number | null
  longitude: number | null
  pressureUpperLimit: number | null
  pressureLowerLimit: number | null
  temperatureUpperLimit: number | null
  temperatureLowerLimit: number | null
  consumptionUpperLimit: number | null
  consumptionLowerLimit: number | null
  batteryLowerLimit: number | null
  customerId: string | null
  customerName: string | null
  category: string | null
  address: string | null
  gaName: string | null
  gaId: string | null
  lastSeenAt: string | null
  status: "NEW" | "ONLINE" | "OFFLINE" | "ALERT" | "STALE"
  currentFlowRate?: number | null
  gasPressure?: number | null
  gasTemperature?: number | null
  batteryLevel?: number | null
  correctedVolumeVb?: number | null
  latestReading?: {
    readingDate?: string | null
    gasVolume?: number | null
    correctedVolumeVb?: number | null
    gasPressure?: number | null
    gasTemperature?: number | null
    currentFlowRate?: number | null
    batteryLevel?: number | null
  } | null
}

interface GeographicalArea {
  id: string
  name: string
}

interface ExistingCustomer {
  id: string
  name: string
}

interface CustomerGroup {
  id?: string
  customerId: string
  customerName?: string
  name?: string
  category: string | null
  address: string | null
  gaId: string | null
  gaName: string | null
  deviceCount: number
  alertCount?: number
  status?: "ONLINE" | "STALE" | "ALERT" | "NEW" | "OFFLINE"
  devices: DeviceItem[]
}

type CustomerSortKey = "customer" | "ga" | "meters" | "category" | "status"

const SORTABLE_COLUMNS: { key: CustomerSortKey; label: string }[] = [
  { key: "customer", label: "Customer" },
  { key: "ga", label: "City / GA" },
  { key: "meters", label: "Meters" },
  { key: "category", label: "Category" },
  { key: "status", label: "Status" },
]

type Pagination = { page: number; limit: number; totalCount: number; totalPages: number }

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "ONLINE", label: "Live" },
  { value: "ALERT", label: "Alert" },
  { value: "STALE", label: "Stale" },
  { value: "NEW", label: "New" },
]

const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "DRS", label: "DRS" },
  { value: "INDUSTRIAL_CNG", label: "Industrial CNG" },
  { value: "INDUSTRIAL_PNG", label: "Industrial PNG" },
]

const STATUS_GUIDE: { status: "ONLINE" | "ALERT" | "STALE" | "NEW"; text: string }[] = [
  { status: "ONLINE", text: "All connected meters reported in the last 24 hours with no active alarms." },
  { status: "ALERT", text: "One or more customer meters have active critical or warning alarms." },
  { status: "STALE", text: "Customer meters have not transmitted readings in over 24 hours." },
  { status: "NEW", text: "Registered customer profile with no operational meters assigned." },
]

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    ONLINE: { cls: "bg-success/10 text-success", label: "Live" },
    ALERT: { cls: "bg-destructive/10 text-destructive", label: "Alert" },
    NEW: { cls: "bg-info/10 text-info", label: "New" },
    STALE: { cls: "bg-muted text-muted-foreground", label: "Stale" },
    OFFLINE: { cls: "bg-muted text-muted-foreground", label: "Offline" },
  }
  const { cls, label } = map[status] ?? { cls: "bg-muted text-muted-foreground", label: status }
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

function CategoryPill({ category }: { category: string | null }) {
  if (!category) return <span className="text-xs text-muted-foreground">—</span>
  return <StatusBadge>{category.replace(/_/g, " ")}</StatusBadge>
}

type DeviceIdentityDraft = {
  id: string
  deviceSerialNo: string
  meterSerialNo: string
  latitude: string
  longitude: string
  meterSize: string
  deviceModel: string
  firmwareVersion: string
  hardwareVersion: string
  configurationVersion: string
  category: string
  initial: {
    meterSerialNo: string
    latitude: string
    longitude: string
    meterSize: string
    deviceModel: string
    firmwareVersion: string
    hardwareVersion: string
    configurationVersion: string
    category: string
  }
}

function numToInput(value: number | null | undefined): string {
  return value == null ? "" : String(value)
}

function strToInput(value: string | null | undefined): string {
  return value ?? ""
}

function deviceToIdentityDraft(device: {
  id: string
  deviceSerialNo: string
  meterSerialNo?: string | null
  latitude?: number | null
  longitude?: number | null
  meterSize?: string | null
  deviceModel?: string | null
  firmwareVersion?: string | null
  hardwareVersion?: string | null
  configurationVersion?: string | null
  category?: string | null
}): DeviceIdentityDraft {
  const meterSerialNo = strToInput(device.meterSerialNo)
  const latitude = numToInput(device.latitude)
  const longitude = numToInput(device.longitude)
  const meterSize = strToInput(device.meterSize)
  const deviceModel = strToInput(device.deviceModel)
  const firmwareVersion = strToInput(device.firmwareVersion)
  const hardwareVersion = strToInput(device.hardwareVersion)
  const configurationVersion = strToInput(device.configurationVersion)
  const category = strToInput(device.category)
  return {
    id: device.id,
    deviceSerialNo: device.deviceSerialNo,
    meterSerialNo,
    latitude,
    longitude,
    meterSize,
    deviceModel,
    firmwareVersion,
    hardwareVersion,
    configurationVersion,
    category,
    initial: {
      meterSerialNo,
      latitude,
      longitude,
      meterSize,
      deviceModel,
      firmwareVersion,
      hardwareVersion,
      configurationVersion,
      category,
    },
  }
}

function buildDeviceIdentityPatch(draft: DeviceIdentityDraft): Record<string, string | null> | null {
  const patch: Record<string, string | null> = {}
  const fields = [
    "meterSerialNo",
    "latitude",
    "longitude",
    "meterSize",
    "deviceModel",
    "firmwareVersion",
    "hardwareVersion",
    "configurationVersion",
    "category",
  ] as const

  for (const field of fields) {
    const next = draft[field].trim()
    const prev = draft.initial[field].trim()
    if (next !== prev) {
      patch[field] = next === "" ? null : next
    }
  }
  return Object.keys(patch).length > 0 ? patch : null
}

const fmt = (val: number | null | undefined, decimals = 2) => {
  if (val == null) return "—"
  return val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerGroup[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 15, totalCount: 0, totalPages: 1 })
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [gaFilter, setGaFilter] = useState("all")
  const [sort, setSort] = useState<ServerSortState<CustomerSortKey>>(null)
  const [gasList, setGasList] = useState<GeographicalArea[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Expandable customer sub-rows
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null)

  // Add Customer Modal States
  const [addCustomerModalOpen, setAddCustomerModalOpen] = useState(false)
  const [newCustName, setNewCustName] = useState("")
  const [newCustGaId, setNewCustGaId] = useState("")
  const [newCustAddress, setNewCustAddress] = useState("")
  const [newCustError, setNewCustError] = useState("")
  const [savingNewCust, setSavingNewCust] = useState(false)

  // Unassigned Devices for Meter Assignment
  const [unassignedDevices, setUnassignedDevices] = useState<DeviceItem[]>([])
  const [fetchingUnassigned, setFetchingUnassigned] = useState(false)

  // Drawer States
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null)

  // Drawer Form States
  const [customerName, setCustomerName] = useState("")
  const [meterIdInput, setMeterIdInput] = useState("")
  const [deviceIdInput, setDeviceIdInput] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("RESIDENTIAL")
  const [address, setAddress] = useState("")
  const [selectedGaId, setSelectedGaId] = useState("")
  const [latitudeInput, setLatitudeInput] = useState("")
  const [longitudeInput, setLongitudeInput] = useState("")
  const [thresholdValues, setThresholdValues] = useState<ThresholdFormValues>(emptyThresholdFormValues())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  // Provisioning Type
  const [provisionType, setProvisionType] = useState<"new" | "existing">("new")
  const [existingCustomers, setExistingCustomers] = useState<ExistingCustomer[]>([])
  const [selectedExistingCustomerId, setSelectedExistingCustomerId] = useState("")
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  // Customer Edit Modal
  const [editingCustomer, setEditingCustomer] = useState<DeviceItem | null>(null)
  const [editCustomerName, setEditCustomerName] = useState("")
  const [editAddress, setEditAddress] = useState("")
  const [editGaId, setEditGaId] = useState("")
  const [editError, setEditError] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  const [editDeviceDrafts, setEditDeviceDrafts] = useState<DeviceIdentityDraft[]>([])
  const [expandedEditDeviceId, setExpandedEditDeviceId] = useState<string | null>(null)
  const [loadingEditDevices, setLoadingEditDevices] = useState(false)
  const [pendingDetach, setPendingDetach] = useState<DeviceIdentityDraft | null>(null)
  const [detachingMeter, setDetachingMeter] = useState(false)
  const [detachError, setDetachError] = useState("")

  // Expandable threshold editing in device sub-row
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null)
  const [rowThresholds, setRowThresholds] = useState<ThresholdFormValues>(emptyThresholdFormValues())
  const [thresholdError, setThresholdError] = useState("")
  const [savingThresholds, setSavingThresholds] = useState(false)
  const [thresholdSavedId, setThresholdSavedId] = useState<string | null>(null)

  // Fetch Geographical Areas
  const fetchGas = useCallback(async () => {
    try {
      const res = await fetch("/api/amr/gas")
      if (res.ok) {
        const data = await res.json()
        setGasList(data)
      }
    } catch {
      // Ignore
    } finally {
      setLoadingRefs(false)
    }
  }, [])

  // Fetch Existing Customers
  const fetchExistingCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/amr/customers?limit=1000")
      if (res.ok) {
        const data = await res.json()
        setExistingCustomers(data.items || data.data || [])
      }
    } catch {
      // Ignore
    }
  }, [])

  // Fetch Grouped Customers
  const fetchCustomers = useCallback(async (page = 1) => {
    setLoading(true)
    setError(null)
    const q = new URLSearchParams({
      page: String(page),
      limit: String(pagination.limit || 15),
    })

    if (search.trim()) q.set("search", search.trim())
    if (statusFilter !== "all") q.set("status", statusFilter)
    if (categoryFilter !== "all") q.set("category", categoryFilter)
    if (gaFilter !== "all") q.set("city", gaFilter)
    if (sort) {
      q.set("sortBy", sort.key)
      q.set("sortDirection", sort.direction)
    }

    try {
      const res = await fetch(`/api/amr/customers/grouped?${q}`)
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const data = await res.json()
      setCustomers(data.items || [])
      setPagination(data.pagination || { page, limit: 15, totalCount: (data.items || []).length, totalPages: 1 })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers")
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, categoryFilter, gaFilter, sort, pagination.limit])

  useEffect(() => {
    fetchGas()
    fetchExistingCustomers()
  }, [fetchGas, fetchExistingCustomers])

  useEffect(() => {
    fetchCustomers(1)
  }, [fetchCustomers])

  const getCustomerStatusSummary = (customer: CustomerGroup) => {
    if (!customer.devices || customer.devices.length === 0) return "NEW"
    const ordered = ["ALERT", "OFFLINE", "STALE", "NEW", "ONLINE"] as const
    return ordered.find((status) => customer.devices.some((device) => device.status === status)) || "ONLINE"
  }

  const openCustomerEditor = async (customer: CustomerGroup) => {
    const custId = customer.customerId || customer.id
    const custName = customer.customerName || customer.name || ""
    const address = customer.address || ""
    const gaId = customer.gaId || ""
    const seedDevice = customer.devices[0]

    if (!custId) return

    setEditingCustomer(seedDevice || ({ id: "temp", customerId: custId } as DeviceItem))
    setEditCustomerName(custName)
    setEditAddress(address)
    setEditGaId(gaId)
    setEditError("")
    setExpandedEditDeviceId(null)
    if (seedDevice) {
      setEditDeviceDrafts([deviceToIdentityDraft(seedDevice)])
    } else {
      setEditDeviceDrafts([])
    }
    setLoadingEditDevices(true)

    try {
      const res = await fetch(`/api/amr/customers/${custId}`)
      if (res.ok) {
        const fullCustomer = await res.json()
        const drafts = (fullCustomer.devices ?? []).map(
          (d: {
            id: string
            deviceSerialNo: string
            meterSerialNo?: string | null
            latitude?: number | null
            longitude?: number | null
            meterSize?: string | null
            deviceModel?: string | null
            firmwareVersion?: string | null
            hardwareVersion?: string | null
            configurationVersion?: string | null
            category?: string | null
          }) => deviceToIdentityDraft(d),
        )
        setEditDeviceDrafts(drafts)
      }
    } catch {
      // Keep single draft if seeded
    } finally {
      setLoadingEditDevices(false)
    }
  }

  const openAddCustomerModal = () => {
    setNewCustName("")
    setNewCustGaId(gasList[0]?.id || "")
    setNewCustAddress("")
    setNewCustError("")
    setAddCustomerModalOpen(true)
  }

  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCustName.trim()) {
      setNewCustError("Customer name is required.")
      return
    }
    if (!newCustGaId) {
      setNewCustError("Geographical area (City) is required.")
      return
    }

    setSavingNewCust(true)
    setNewCustError("")

    try {
      const res = await fetch("/api/amr/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCustName.trim(),
          gaId: newCustGaId,
          address: newCustAddress.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create customer")

      setAddCustomerModalOpen(false)
      fetchCustomers(pagination.page)
      fetchExistingCustomers()
    } catch (err: unknown) {
      setNewCustError(err instanceof Error ? err.message : "Failed to create customer")
    } finally {
      setSavingNewCust(false)
    }
  }

  const fetchUnassignedDevices = async () => {
    setFetchingUnassigned(true)
    try {
      const res = await fetch("/api/amr/devices?status=new&limit=100")
      if (res.ok) {
        const data = await res.json()
        setUnassignedDevices(data.items || [])
        return data.items || []
      }
    } catch {
      // Fallback
    } finally {
      setFetchingUnassigned(false)
    }
    return []
  }

  const openAddMeterForCustomer = async (customer: CustomerGroup) => {
    const existingDevice = customer.devices[0] || null
    const custId = customer.customerId || customer.id || ""
    const custName = customer.customerName || customer.name || ""

    setSelectedDevice(existingDevice)
    setProvisionType("existing")
    setSelectedExistingCustomerId(custId)
    setCustomerName(custName)
    setMeterIdInput(existingDevice?.deviceSerialNo || "")
    setDeviceIdInput("")
    setSelectedCategory("RESIDENTIAL")
    setAddress(customer.address ?? "")
    setSelectedGaId(customer.gaId ?? gasList[0]?.id ?? "")
    setLatitudeInput("")
    setLongitudeInput("")
    setThresholdValues(emptyThresholdFormValues())
    setFormError("")
    setDrawerOpen(true)

    const unassigned = await fetchUnassignedDevices()
    if (!existingDevice && unassigned.length > 0) {
      setSelectedDevice(unassigned[0])
      setMeterIdInput(unassigned[0].deviceSerialNo)
      if (unassigned[0].latitude) setLatitudeInput(String(unassigned[0].latitude))
      if (unassigned[0].longitude) setLongitudeInput(String(unassigned[0].longitude))
      setThresholdValues(thresholdFormFromDevice(unassigned[0]))
    }
  }

  const updateEditDeviceDraft = (
    deviceId: string,
    field: keyof Omit<DeviceIdentityDraft, "id" | "deviceSerialNo" | "initial">,
    value: string,
  ) => {
    setEditDeviceDrafts((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, [field]: value } : d)),
    )
  }

  const detachMeterFromCustomer = async () => {
    if (!pendingDetach) return

    setDetachingMeter(true)
    setDetachError("")
    try {
      const response = await fetch(`/api/amr/devices/${pendingDetach.id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Failed to detach meter")

      setEditDeviceDrafts((drafts) =>
        drafts.filter((draft) => draft.id !== pendingDetach.id),
      )
      setExpandedEditDeviceId((deviceId) =>
        deviceId === pendingDetach.id ? null : deviceId,
      )
      setPendingDetach(null)
      fetchCustomers(pagination.page)
    } catch (error) {
      setDetachError(error instanceof Error ? error.message : "Failed to detach meter")
    } finally {
      setDetachingMeter(false)
    }
  }

  const saveCustomerEdit = async (event: React.FormEvent) => {
    event.preventDefault()
    const targetCustId = editingCustomer?.customerId
    if (!targetCustId || !editCustomerName.trim() || !editGaId) {
      setEditError("Customer name and geographical area are required.")
      return
    }

    for (const draft of editDeviceDrafts) {
      if (draft.latitude.trim() || draft.longitude.trim()) {
        const lat = Number(draft.latitude)
        const lng = Number(draft.longitude)
        if (draft.latitude.trim() && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
          setEditError(`Latitude for ${draft.deviceSerialNo} must be between -90 and 90.`)
          return
        }
        if (draft.longitude.trim() && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
          setEditError(`Longitude for ${draft.deviceSerialNo} must be between -180 and 180.`)
          return
        }
      }
    }

    setSavingEdit(true)
    setEditError("")
    try {
      const response = await fetch(`/api/amr/customers/${targetCustId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editCustomerName.trim(),
          address: editAddress.trim() || null,
          gaId: editGaId,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Failed to update customer")

      for (const draft of editDeviceDrafts) {
        const patch = buildDeviceIdentityPatch(draft)
        if (!patch) continue
        const deviceRes = await fetch(`/api/amr/devices/${draft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        const deviceData = await deviceRes.json()
        if (!deviceRes.ok) {
          throw new Error(deviceData.error ?? `Failed to update device ${draft.deviceSerialNo}`)
        }
      }

      setEditingCustomer(null)
      fetchCustomers(pagination.page)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to update customer")
    } finally {
      setSavingEdit(false)
    }
  }

  const toggleThresholdExpand = (device: DeviceItem) => {
    if (expandedDeviceId === device.id) {
      setExpandedDeviceId(null)
      setThresholdError("")
      setThresholdSavedId(null)
      return
    }
    setExpandedDeviceId(device.id)
    setRowThresholds(thresholdFormFromDevice(device))
    setThresholdError("")
    setThresholdSavedId(null)
  }

  const saveRowThresholds = async (deviceId: string) => {
    const parsed = parseAndValidateThresholdInputs(rowThresholds)
    if (!parsed.ok) {
      setThresholdError(parsed.error)
      return
    }
    setSavingThresholds(true)
    setThresholdError("")
    try {
      const res = await fetch(`/api/amr/devices/${deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.values),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save thresholds")
      setThresholdSavedId(deviceId)
      setTimeout(() => setThresholdSavedId((id) => (id === deviceId ? null : id)), 2500)
      fetchCustomers(pagination.page)
    } catch (err: unknown) {
      setThresholdError(err instanceof Error ? err.message : "Failed to save thresholds")
    } finally {
      setSavingThresholds(false)
    }
  }

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetDeviceId = selectedDevice?.id || meterIdInput.trim()
    if (!targetDeviceId) {
      setFormError("Please select an available meter or enter a meter serial number.")
      return
    }

    if (provisionType === "new" && !customerName.trim()) {
      setFormError("Customer name is required.")
      return
    }

    if (provisionType === "existing" && !selectedExistingCustomerId) {
      setFormError("Please select an existing customer.")
      return
    }

    if (!latitudeInput.trim() || !longitudeInput.trim()) {
      setFormError("Latitude and longitude are required for provisioning.")
      return
    }
    const latitude = Number(latitudeInput)
    const longitude = Number(longitudeInput)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setFormError("Latitude must be a number between -90 and 90.")
      return
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setFormError("Longitude must be a number between -180 and 180.")
      return
    }

    const parsedThresholds = parseAndValidateThresholdInputs(thresholdValues)
    if (!parsedThresholds.ok) {
      setFormError(parsedThresholds.error)
      return
    }

    setShowConfirmDialog(true)
  }

  const confirmProvisioning = async () => {
    setSubmitting(true)
    setShowConfirmDialog(false)
    setFormError("")

    try {
      let finalCustomerId = selectedExistingCustomerId

      if (provisionType === "new") {
        const custRes = await fetch("/api/amr/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: customerName.trim(),
            address: address.trim() || null,
            gaId: selectedGaId,
          }),
        })

        const custData = await custRes.json()
        if (!custRes.ok) throw new Error(custData.error || "Failed to create customer")
        finalCustomerId = custData.id
      }

      const parsedThresholds = parseAndValidateThresholdInputs(thresholdValues)
      const thresholdPayload = parsedThresholds.ok ? parsedThresholds.values : {}

      let devId = selectedDevice?.id
      if (!devId) {
        const findRes = await fetch(`/api/amr/devices?search=${encodeURIComponent(meterIdInput.trim())}`)
        if (findRes.ok) {
          const findData = await findRes.json()
          const matched = findData.items?.find((d: DeviceItem) => d.deviceSerialNo === meterIdInput.trim())
          if (matched) devId = matched.id
        }
      }

      if (!devId) {
        throw new Error(`Device "${meterIdInput.trim()}" not found on network to provision.`)
      }

      const updatePayload: Record<string, unknown> = {
        ...thresholdPayload,
        customerId: finalCustomerId,
        category: selectedCategory || null,
        latitude: Number(latitudeInput),
        longitude: Number(longitudeInput),
      }
      if (deviceIdInput.trim()) {
        updatePayload.meterSerialNo = deviceIdInput.trim()
      }

      const devRes = await fetch(`/api/amr/devices/${devId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      })

      const devData = await devRes.json()
      if (!devRes.ok) throw new Error(devData.error || "Failed to update device limits and customer assignment")

      setDrawerOpen(false)
      fetchCustomers(pagination.page)
      fetchExistingCustomers()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "An error occurred while provisioning.")
    } finally {
      setSubmitting(false)
    }
  }

  const hasFilters = search.trim() !== "" || statusFilter !== "all" || categoryFilter !== "all" || gaFilter !== "all"
  const firstRow = (pagination.page - 1) * pagination.limit + 1
  const lastRow = Math.min(pagination.page * pagination.limit, pagination.totalCount)
  const sortDescription = sort
    ? `Sorted by ${SORTABLE_COLUMNS.find((column) => column.key === sort.key)?.label.toLowerCase()} (${sort.direction === "asc" ? "ascending" : "descending"})`
    : "Sorted by customer name"

  const cityOptions = [
    { value: "all", label: "All cities" },
    ...gasList.map((g) => ({ value: g.id, label: g.name })),
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AMR Customers</h1>
          <p className="text-sm text-muted-foreground">
            All registered AMR customer accounts · {pagination.totalCount} {hasFilters ? "matching" : "total"}
          </p>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Overview and management of customer accounts across all geographical distribution areas.
            Review customer classifications, registered meters, live communication status, and alarm states.
            Expand any customer to inspect connected meters, current flow and pressure telemetry, or modify threshold limits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openAddCustomerModal}>
            <PlusCircle className="size-3.5" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      <DashboardPanel
        title="Filters"
        description="Search by customer name, meter serial, or device serial, and narrow the list by status, category, or city."
      >
        <div className="flex flex-wrap gap-3">
          {/* Search Input */}
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search customer, serial…"
              aria-label="Search customers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Status Filter */}
          <Select
            items={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={(value) => {
              if (value) setStatusFilter(value)
            }}
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {/* Category Filter */}
          <Select
            items={CATEGORY_OPTIONS}
            value={categoryFilter}
            onValueChange={(value) => {
              if (value) setCategoryFilter(value)
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {/* City / Geographical Area Filter */}
          <Select
            items={cityOptions}
            value={gaFilter}
            onValueChange={(value) => {
              if (value) setGaFilter(value)
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by city">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {cityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Status Guide */}
        <div className="mt-4 grid gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
          {STATUS_GUIDE.map((item) => (
            <div key={item.status} className="flex items-start gap-2">
              <StatusPill status={item.status} />
              <p className="text-xs text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </DashboardPanel>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Main Customers Table */}
      <DashboardPanel
        title="Customers"
        description={`${sortDescription} · click a column heading to sort · page ${pagination.page} of ${pagination.totalPages}`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              {SORTABLE_COLUMNS.map((column) => (
                <SortableColumnHead
                  key={column.key}
                  label={column.label}
                  columnKey={column.key}
                  sort={sort}
                  onSortChange={setSort}
                />
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                  Loading customers…
                </TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  <WifiOff className="mx-auto mb-2 size-5" />
                  <p className="font-medium text-foreground">No customers found</p>
                  <p>Try a different search term or filter.</p>
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer, idx) => {
                const custKey = customer.customerId || customer.id || `cust-${idx}`
                const isExpanded = expandedCustomerId === custKey
                const summaryStatus = customer.status || getCustomerStatusSummary(customer)
                const custName = customer.customerName || customer.name || "Unnamed Customer"
                const alertCount = customer.alertCount ?? customer.devices.filter((d) => d.status === "ALERT").length

                return (
                  <Fragment key={`fragment-${custKey}`}>
                    <TableRow
                      key={`row-${custKey}`}
                      tabIndex={0}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedCustomerId(isExpanded ? null : custKey)}
                    >
                      <TableCell className="w-10 py-3" onClick={(e) => e.stopPropagation()}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          onClick={() => setExpandedCustomerId(isExpanded ? null : custKey)}
                          aria-label={isExpanded ? "Collapse customer" : "Expand customer"}
                        >
                          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{custName}</span>
                          {customer.address && (
                            <span className="text-xs text-muted-foreground line-clamp-1">{customer.address}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {customer.gaName || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm tabular-nums text-foreground">
                            {customer.deviceCount}
                          </span>
                          {alertCount > 0 && (
                            <span className="inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                              {alertCount} alert{alertCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <CategoryPill category={customer.category} />
                      </TableCell>
                      <TableCell>
                        <StatusPill status={summaryStatus} />
                      </TableCell>
                      <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => openAddMeterForCustomer(customer)}
                          >
                            <PlusCircle className="mr-1 size-3.5" />
                            Add Meter
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => openCustomerEditor(customer)}
                          >
                            <Pencil className="mr-1 size-3.5" />
                            Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Sub-table for customer devices */}
                    {isExpanded && (
                      <TableRow key={`expand-${custKey}`} className="border-border bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={7} className="px-4 py-3">
                          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  Assigned Meters · {customer.devices.length} {customer.devices.length === 1 ? "meter" : "meters"}
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  Telemetry data and threshold limits for meters registered under {custName}.
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => openAddMeterForCustomer(customer)}
                              >
                                <PlusCircle className="mr-1 size-3.5" />
                                Add Meter
                              </Button>
                            </div>

                            {customer.devices.length === 0 ? (
                              <p className="py-6 text-center text-xs text-muted-foreground">
                                No meters assigned yet. Click &quot;Add Meter&quot; to assign a hardware device to this customer.
                              </p>
                            ) : (
                              <div className="overflow-hidden rounded-lg border border-border">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/50">
                                      <TableHead className="w-10" />
                                      <TableHead>Device Serial</TableHead>
                                      <TableHead>Meter Serial</TableHead>
                                      <TableHead>Category</TableHead>
                                      <TableHead>Flow (SCMH)</TableHead>
                                      <TableHead>Pressure (bar)</TableHead>
                                      <TableHead>Battery</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {customer.devices.map((device, devIdx) => {
                                      const devKey = device.id || `dev-${devIdx}`
                                      const isDeviceExpanded = expandedDeviceId === device.id

                                      const flowVal = device.currentFlowRate ?? device.latestReading?.currentFlowRate
                                      const pressureVal = device.gasPressure ?? device.latestReading?.gasPressure
                                      const batteryVal = device.batteryLevel ?? device.latestReading?.batteryLevel

                                      return (
                                        <Fragment key={`dev-frag-${devKey}`}>
                                          <TableRow key={`dev-row-${devKey}`} className="hover:bg-muted/40">
                                            <TableCell className="w-10 py-2.5">
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-6 text-muted-foreground"
                                                onClick={() => toggleThresholdExpand(device)}
                                                aria-label={isDeviceExpanded ? "Collapse thresholds" : "Configure thresholds"}
                                              >
                                                {isDeviceExpanded ? (
                                                  <ChevronDown className="size-3.5" />
                                                ) : (
                                                  <ChevronRight className="size-3.5" />
                                                )}
                                              </Button>
                                            </TableCell>
                                            <TableCell className="font-mono text-sm font-medium">
                                              <span className="inline-flex items-center gap-1.5">
                                                <Flame className="size-3.5 text-muted-foreground" />
                                                <Link
                                                  href={`/amr/meters/${device.deviceSerialNo}`}
                                                  className="text-primary hover:underline dark:text-info"
                                                >
                                                  {device.deviceSerialNo}
                                                </Link>
                                              </span>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                              {device.meterSerialNo || "—"}
                                            </TableCell>
                                            <TableCell>
                                              <CategoryPill category={device.category} />
                                            </TableCell>
                                            <TableCell className="font-mono text-xs tabular-nums text-foreground">
                                              {fmt(flowVal)}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs tabular-nums text-foreground">
                                              {pressureVal != null ? `${fmt(pressureVal)} bar` : "—"}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs tabular-nums text-foreground">
                                              {batteryVal != null ? `${Math.round(batteryVal)}%` : "—"}
                                            </TableCell>
                                            <TableCell>
                                              <StatusPill status={device.status} />
                                            </TableCell>
                                            <TableCell className="py-2.5 text-right">
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                                onClick={() => toggleThresholdExpand(device)}
                                              >
                                                {isDeviceExpanded ? "Close Limits" : "Limits"}
                                              </Button>
                                            </TableCell>
                                          </TableRow>

                                          {/* Inline Thresholds editor */}
                                          {isDeviceExpanded && (
                                            <TableRow key={`thresholds-${devKey}`} className="bg-muted/30 hover:bg-muted/30">
                                              <TableCell colSpan={9} className="px-4 py-3">
                                                <div className="space-y-3 rounded-lg border border-border bg-background p-3.5">
                                                  <div className="flex items-center justify-between gap-3">
                                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                      Operational Limits · {device.deviceSerialNo}
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                      {thresholdSavedId === device.id && (
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                                                          <Check className="size-3.5" />
                                                          Saved
                                                        </span>
                                                      )}
                                                      <Button
                                                        type="button"
                                                        size="sm"
                                                        disabled={savingThresholds}
                                                        onClick={() => saveRowThresholds(device.id)}
                                                        className="h-7 text-xs"
                                                      >
                                                        {savingThresholds ? "Saving…" : "Save Limits"}
                                                      </Button>
                                                    </div>
                                                  </div>
                                                  <ThresholdCardSet
                                                    values={rowThresholds}
                                                    onChange={(field, value) => {
                                                      setRowThresholds((prev) => ({ ...prev, [field]: value }))
                                                      setThresholdError("")
                                                      setThresholdSavedId(null)
                                                    }}
                                                    error={thresholdError || null}
                                                  />
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          )}
                                        </Fragment>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination Controls */}
        {!loading && pagination.totalCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              Showing {firstRow}-{lastRow} of {pagination.totalCount} · page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => fetchCustomers(pagination.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchCustomers(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </DashboardPanel>

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-background shadow-2xl">
            <CardHeader>
              <CardTitle>Edit Customer Information</CardTitle>
              <p className="text-xs text-muted-foreground">
                Customer details are shared; category and operational parameters are configured per meter.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveCustomerEdit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Customer Name
                  </label>
                  <Input
                    value={editCustomerName}
                    onChange={(event) => setEditCustomerName(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Geographical Area
                  </label>
                  <select
                    value={editGaId}
                    onChange={(event) => setEditGaId(event.target.value)}
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="" disabled>Select a city</option>
                    {gasList.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Address
                  </label>
                  <Input
                    value={editAddress}
                    onChange={(event) => setEditAddress(event.target.value)}
                  />
                </div>

                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meters</p>
                    {loadingEditDevices && (
                      <span className="text-xs text-muted-foreground">Loading meters…</span>
                    )}
                  </div>
                  {editDeviceDrafts.length === 0 && !loadingEditDevices && (
                    <p className="text-sm text-muted-foreground">No meters assigned to this customer.</p>
                  )}
                  <div className="space-y-2">
                    {editDeviceDrafts.map((draft) => {
                      const isOpen = expandedEditDeviceId === draft.id
                      return (
                        <div key={draft.id} className="rounded-lg border border-border bg-muted/20">
                          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-sm text-foreground">{draft.deviceSerialNo}</p>
                              <p className="text-xs text-muted-foreground">
                                Meter serial: <span className="font-mono">{draft.meterSerialNo || "—"}</span>
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={savingEdit || detachingMeter}
                                onClick={() => {
                                  setDetachError("")
                                  setPendingDetach(draft)
                                }}
                              >
                                <Unlink className="mr-1 size-3.5" />
                                Detach
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setExpandedEditDeviceId(isOpen ? null : draft.id)}
                              >
                                {isOpen ? "Done" : "Edit"}
                              </Button>
                            </div>
                          </div>
                          {isOpen && (
                            <div className="space-y-3 border-t border-border px-3 py-3">
                              <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground">Meter Category</label>
                                <select
                                  value={draft.category}
                                  onChange={(e) => updateEditDeviceDraft(draft.id, "category", e.target.value)}
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                                >
                                  <option value="">Uncategorized</option>
                                  <option value="COMMERCIAL">Commercial</option>
                                  <option value="RESIDENTIAL">Residential</option>
                                  <option value="DRS">DRS</option>
                                  <option value="INDUSTRIAL_CNG">Industrial CNG</option>
                                  <option value="INDUSTRIAL_PNG">Industrial PNG</option>
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground">Device Serial No</label>
                                <Input
                                  value={draft.deviceSerialNo}
                                  readOnly
                                  disabled
                                  className="cursor-not-allowed bg-muted font-mono text-sm text-muted-foreground"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground">Meter Serial No</label>
                                <Input
                                  value={draft.meterSerialNo}
                                  onChange={(e) => updateEditDeviceDraft(draft.id, "meterSerialNo", e.target.value)}
                                  className="font-mono text-sm"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-xs text-muted-foreground">Latitude</label>
                                  <Input
                                    type="number"
                                    step="0.000001"
                                    value={draft.latitude}
                                    onChange={(e) => updateEditDeviceDraft(draft.id, "latitude", e.target.value)}
                                    className="font-mono text-sm"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-xs text-muted-foreground">Longitude</label>
                                  <Input
                                    type="number"
                                    step="0.000001"
                                    value={draft.longitude}
                                    onChange={(e) => updateEditDeviceDraft(draft.id, "longitude", e.target.value)}
                                    className="font-mono text-sm"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-xs text-muted-foreground">Meter Size</label>
                                  <Input
                                    value={draft.meterSize}
                                    onChange={(e) => updateEditDeviceDraft(draft.id, "meterSize", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-xs text-muted-foreground">Meter Model</label>
                                  <Input
                                    value={draft.deviceModel}
                                    onChange={(e) => updateEditDeviceDraft(draft.id, "deviceModel", e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-xs text-muted-foreground">Firmware Version</label>
                                  <Input
                                    value={draft.firmwareVersion}
                                    onChange={(e) => updateEditDeviceDraft(draft.id, "firmwareVersion", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-xs text-muted-foreground">Hardware Version</label>
                                  <Input
                                    value={draft.hardwareVersion}
                                    onChange={(e) => updateEditDeviceDraft(draft.id, "hardwareVersion", e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground">Configuration Version</label>
                                <Input
                                  value={draft.configurationVersion}
                                  onChange={(e) => updateEditDeviceDraft(draft.id, "configurationVersion", e.target.value)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {editError && (
                  <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {editError}
                  </p>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setEditingCustomer(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={savingEdit}>
                    {savingEdit ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detach Confirmation Dialog */}
      {pendingDetach && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Detach meter?</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Detach meter <span className="font-mono font-medium text-foreground">{pendingDetach.deviceSerialNo}</span> from this customer?
              The meter hardware and its reading history will remain stored safely in the database.
            </p>
            {detachError && (
              <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {detachError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={detachingMeter}
                onClick={() => {
                  setPendingDetach(null)
                  setDetachError("")
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={detachingMeter}
                onClick={detachMeterFromCustomer}
              >
                {detachingMeter ? "Detaching…" : "Detach Meter"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Customer Modal */}
      {addCustomerModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md border-border bg-background shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Add New Customer
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create a customer account profile to assign gas meters and stations.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setAddCustomerModalOpen(false)}
                className="size-8 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleAddCustomerSubmit} className="space-y-4">
                {newCustError && (
                  <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive">
                    {newCustError}
                  </p>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Customer Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Acme Industrial Ltd"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Geographical Area (City) <span className="text-destructive">*</span>
                  </label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    value={newCustGaId}
                    onChange={(e) => setNewCustGaId(e.target.value)}
                    required
                  >
                    <option value="" disabled>Select a city…</option>
                    {gasList.map((ga) => (
                      <option key={ga.id} value={ga.id}>{ga.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Address
                  </label>
                  <Input
                    placeholder="Enter full street address…"
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-3 border-t border-border pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddCustomerModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={savingNewCust}
                  >
                    {savingNewCust ? "Saving…" : "Create Customer"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Slide-out Sidebar Drawer Form (Add Meter / Provisioning) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setDrawerOpen(false)} />

          <div className="relative flex h-full w-full max-w-lg flex-col justify-between overflow-y-auto border-l border-border bg-background p-6 shadow-2xl animate-in slide-in-from-right">
            <div>
              <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {provisionType === "existing" ? `Add Meter to ${customerName || "Customer"}` : "Provision Endpoint"}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Assign a gas meter hardware endpoint and configure monitoring limits.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDrawerOpen(false)}
                  className="size-8 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </Button>
              </div>

              {formError && (
                <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive">
                  {formError}
                </p>
              )}

              <form id="provision-form" onSubmit={handleProvisionSubmit} className="space-y-4">
                {provisionType === "existing" && (
                  <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Select Meter Hardware
                    </label>
                    {fetchingUnassigned ? (
                      <p className="text-xs text-muted-foreground">Loading available unassigned meters…</p>
                    ) : unassignedDevices.length > 0 ? (
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        value={selectedDevice?.id || ""}
                        onChange={(e) => {
                          const dev = unassignedDevices.find((d) => d.id === e.target.value)
                          if (dev) {
                            setSelectedDevice(dev)
                            setMeterIdInput(dev.deviceSerialNo)
                            if (dev.latitude) setLatitudeInput(String(dev.latitude))
                            if (dev.longitude) setLongitudeInput(String(dev.longitude))
                            setThresholdValues(thresholdFormFromDevice(dev))
                          }
                        }}
                      >
                        <option value="">-- Choose from available meters ({unassignedDevices.length}) --</option>
                        {unassignedDevices.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.deviceSerialNo} {d.meterSerialNo ? `(${d.meterSerialNo})` : ""} — {d.status}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">
                        {selectedDevice ? `Using meter ${selectedDevice.deviceSerialNo}` : "No unassigned meters detected on network. Enter Device ID below:"}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Device Serial No / ID
                  </label>
                  <Input
                    value={meterIdInput || selectedDevice?.deviceSerialNo || ""}
                    onChange={(e) => setMeterIdInput(e.target.value)}
                    placeholder="e.g. DM-1803 or EVC-000123"
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Meter Serial No (Optional)
                  </label>
                  <Input
                    placeholder="Enter Meter Serial No…"
                    value={deviceIdInput}
                    onChange={(e) => setDeviceIdInput(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Latitude
                    </label>
                    <Input
                      type="number"
                      step="0.000001"
                      placeholder="e.g. 28.6139"
                      value={latitudeInput}
                      onChange={(event) => setLatitudeInput(event.target.value)}
                      required
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Longitude
                    </label>
                    <Input
                      type="number"
                      step="0.000001"
                      placeholder="e.g. 77.2090"
                      value={longitudeInput}
                      onChange={(event) => setLongitudeInput(event.target.value)}
                      required
                      className="font-mono text-sm"
                    />
                  </div>
                </div>

                {!selectedExistingCustomerId && (
                  <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-1">
                    <Button
                      type="button"
                      variant={provisionType === "new" ? "default" : "ghost"}
                      className="h-8 flex-1 text-xs"
                      onClick={() => setProvisionType("new")}
                    >
                      New Customer
                    </Button>
                    <Button
                      type="button"
                      variant={provisionType === "existing" ? "default" : "ghost"}
                      className="h-8 flex-1 text-xs"
                      onClick={() => setProvisionType("existing")}
                    >
                      Existing Customer
                    </Button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Meter Category
                  </label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <option value="">Uncategorized</option>
                    <option value="RESIDENTIAL">Residential</option>
                    <option value="COMMERCIAL">Commercial</option>
                    <option value="DRS">DRS</option>
                    <option value="INDUSTRIAL_CNG">Industrial CNG</option>
                    <option value="INDUSTRIAL_PNG">Industrial PNG</option>
                  </select>
                </div>

                {provisionType === "existing" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Target Customer
                    </label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      value={selectedExistingCustomerId}
                      onChange={(e) => {
                        setSelectedExistingCustomerId(e.target.value)
                        const found = existingCustomers.find((c) => c.id === e.target.value)
                        if (found) setCustomerName(found.name)
                      }}
                      required
                    >
                      <option value="" disabled>Select a customer…</option>
                      {loadingRefs ? (
                        <option value="" disabled>Loading customers…</option>
                      ) : existingCustomers.length === 0 ? (
                        <option value="" disabled>No customers found</option>
                      ) : (
                        existingCustomers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))
                      )}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Customer Name
                      </label>
                      <Input
                        placeholder="Enter customer name…"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        required={provisionType === "new"}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Geographical Area (City)
                      </label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        value={selectedGaId}
                        onChange={(e) => setSelectedGaId(e.target.value)}
                        required={provisionType === "new"}
                      >
                        <option value="" disabled>Select a city…</option>
                        {loadingRefs ? (
                          <option value="" disabled>Loading cities…</option>
                        ) : gasList.length === 0 ? (
                          <option value="" disabled>No cities available</option>
                        ) : (
                          gasList.map((ga) => (
                            <option key={ga.id} value={ga.id}>{ga.name}</option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Address
                      </label>
                      <Input
                        placeholder="Enter address…"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <ThresholdCardSet
                  values={thresholdValues}
                  onChange={(field, value) =>
                    setThresholdValues((prev) => ({ ...prev, [field]: value }))
                  }
                />
              </form>
            </div>

            <div className="mt-6 flex gap-3 border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={() => setDrawerOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="provision-form"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? "Saving…" : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Confirm Provisioning</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Assign meter <span className="font-mono font-medium text-foreground">{selectedDevice?.deviceSerialNo}</span> to
              {provisionType === "new" ? " a new customer" : " the selected customer"}?
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmProvisioning}
                className="flex-1"
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

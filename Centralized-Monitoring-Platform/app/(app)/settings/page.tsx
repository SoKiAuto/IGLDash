import { requireSession } from "@/lib/session"
import { GaManagementCard } from "@/components/settings/ga-management-card"

export const metadata = {
  title: "Settings | AMR Centralized Monitoring Platform",
  description: "Manage geographical areas for customer and meter assignments.",
}

// Accessible by all authenticated users without any role restriction.
export default async function SettingsPage() {
  await requireSession()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage geographical areas for customer and meter assignments across the AMR monitoring network.
        </p>
      </div>

      <GaManagementCard />
    </div>
  )
}

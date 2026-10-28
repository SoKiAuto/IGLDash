This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Monitoring metric definitions

- The dashboard's exception-management card is shown before the general KPI and trend sections. It includes unacknowledged AMR alarms, estimated power outages, and stations below the combined-availability threshold.
- Dispenser utilization is grouped by dispenser serial and side. Vehicle type is estimated from fill size: auto-rickshaw up to 4 kg, car over 4 through 12 kg, and heavy over 12 kg. Per-class utilization is `class kg / (station per-dispenser rated kg/hour x 24 hours x calendar days) x 100`; the configured per-dispenser rating is applied to each side. The table also shows class fill share.
- Combined availability is an observed-signal estimate. A dispenser is known up only in an hour with a recorded fill; compressor status is inferred from a running-hour counter interval no longer than one hour. The numerator is hours with a fill and a counter increase; the denominator is hours where both signals are observable. No-fill hours and gaps/resets in compressor readings are unknown and excluded. Coverage is shown against open station hours; this is not a measure of unobserved idle-hour readiness.
- The existing activity-based station uptime remains a separate metric: an hour counts up when any fill, compressor counter increase, or gas flow is observed.
- Cascade/delivery pressure correlation is not displayed until the cascade pressure column is validated per station. Once mapped, fills pair with the nearest prior cascade sample no older than 15 minutes; correlation is descriptive, not causal.
- Compressor flow-capacity utilization requires a validated actual-discharge-flow source/unit and a rated flow capacity for each compressor. Its formula is `time-weighted average actual discharge flow / rated discharge flow x 100`; the schema currently does not provide the rated capacities.

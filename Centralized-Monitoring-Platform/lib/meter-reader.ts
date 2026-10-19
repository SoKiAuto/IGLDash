export * from "./amr-db"

import {
  fetchAmrAlarms,
  fetchAmrCustomers,
  fetchAmrDevices,
  fetchAmrOverview,
} from "./amr-db"

export const getAlarms = fetchAmrAlarms
export const getDevices = fetchAmrDevices
export const getCustomers = fetchAmrCustomers
export const getAmrOverview = fetchAmrOverview

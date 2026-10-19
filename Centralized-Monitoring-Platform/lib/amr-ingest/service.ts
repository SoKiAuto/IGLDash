import { amrPool } from "@/lib/amr-db";
import { parseIngestPayload } from "./parser";
import { checkGasOutOfRangeAlarm, checkMeterFailureAlarm, checkDeviceThresholds } from "./alarm-check";
import { CapacityExceededError } from "./types";
import crypto from "node:crypto";

export { CapacityExceededError };

export async function processIngestPayload(rawBody: unknown) {
  const parsed = parseIngestPayload(rawBody);

  // 1. Capacity check for new devices
  const existingDevRes = await amrPool.query(
    'SELECT id FROM "Device" WHERE "deviceSerialNo" = $1 LIMIT 1',
    [parsed.deviceSerialNo]
  );
  const existingDevice = existingDevRes.rows[0];

  if (!existingDevice) {
    const settingsRes = await amrPool.query(
      'SELECT "maxMeterCapacity" FROM "SystemSettings" WHERE id = $1 LIMIT 1',
      ['singleton']
    );
    const maxCapacity = settingsRes.rows[0]?.maxMeterCapacity;

    if (maxCapacity != null) {
      const countRes = await amrPool.query('SELECT COUNT(*)::int as count FROM "Device"');
      const currentCount = countRes.rows[0]?.count ?? 0;

      if (currentCount >= maxCapacity) {
        const rejectionId = crypto.randomUUID();
        await amrPool.query(
          `INSERT INTO "RejectedConnectionAttempt" (id, "deviceSerialNo", "rawPayload", "attemptedAt", "acknowledged")
           VALUES ($1, $2, $3::jsonb, NOW(), false)`,
          [rejectionId, parsed.deviceSerialNo, JSON.stringify(parsed.rawPayload)]
        );
        throw new CapacityExceededError(
          `Maximum meter capacity (${maxCapacity}) reached — rejected new device ${parsed.deviceSerialNo}`
        );
      }
    }
  }

  // 2. Upsert Device registry
  let deviceId: string;
  if (existingDevice) {
    deviceId = existingDevice.id;
    await amrPool.query(
      `UPDATE "Device" SET
         "lastSeenAt" = NOW(),
         "meterSerialNo" = COALESCE($1, "meterSerialNo"),
         "meterSize" = COALESCE($2, "meterSize"),
         "firmwareVersion" = COALESCE($3, "firmwareVersion"),
         "hardwareVersion" = COALESCE($4, "hardwareVersion"),
         "deviceModel" = COALESCE($5, "deviceModel"),
         "configurationVersion" = COALESCE($6, "configurationVersion")
       WHERE id = $7`,
      [
        parsed.meterSerialNo ?? null,
        parsed.meterSize ?? null,
        parsed.firmwareVersion ?? null,
        parsed.hardwareVersion ?? null,
        parsed.deviceModel ?? null,
        parsed.configurationVersion ?? null,
        deviceId,
      ]
    );
  } else {
    deviceId = crypto.randomUUID();
    await amrPool.query(
      `INSERT INTO "Device" (
         id, "deviceSerialNo", "meterSerialNo", "meterSize",
         "firmwareVersion", "hardwareVersion", "deviceModel",
         "configurationVersion", "firstSeenAt", "lastSeenAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        deviceId,
        parsed.deviceSerialNo,
        parsed.meterSerialNo ?? null,
        parsed.meterSize ?? null,
        parsed.firmwareVersion ?? null,
        parsed.hardwareVersion ?? null,
        parsed.deviceModel ?? null,
        parsed.configurationVersion ?? null,
      ]
    );
  }

  // 3. Insert Reading
  const readingId = crypto.randomUUID();
  await amrPool.query(
    `INSERT INTO "Reading" (
       id, "deviceId", "readingDate", "correctedVolumeVb", "uncorrectedVolumeVm",
       "gasPressure", "pressureMax", "pressureMin", "gasTemperature",
       "temperatureMax", "temperatureMin", "compressibilityZ", "compressibilityFpv",
       "correctionFactorC", "gasDensity", "batteryLevel", "currentFlowRate",
       "hourlyConsumption", "rawPayload", "receivedAt"
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
     )`,
    [
      readingId,
      deviceId,
      parsed.readingDate,
      parsed.correctedVolumeVb ?? null,
      parsed.uncorrectedVolumeVm ?? null,
      parsed.gasPressure ?? null,
      parsed.pressureMax ?? null,
      parsed.pressureMin ?? null,
      parsed.gasTemperature ?? null,
      parsed.temperatureMax ?? null,
      parsed.temperatureMin ?? null,
      parsed.compressibilityZ ?? null,
      parsed.compressibilityFpv ?? null,
      parsed.correctionFactorC ?? null,
      parsed.gasDensity ?? null,
      parsed.batteryLevel ?? null,
      parsed.currentFlowRate ?? null,
      parsed.hourlyConsumption ? JSON.stringify(parsed.hourlyConsumption) : null,
      JSON.stringify(parsed.rawPayload),
    ]
  );

  // 4. Run Alarm Checks
  try {
    await checkGasOutOfRangeAlarm(deviceId, parsed.readingDate, parsed.correctedVolumeVb);
  } catch (err) {
    console.error("[AMR Ingestion] Gas out-of-range alarm check failed:", err);
  }

  try {
    await checkDeviceThresholds(deviceId, parsed.readingDate, {
      gasPressure: parsed.gasPressure ?? null,
      gasTemperature: parsed.gasTemperature ?? null,
      batteryLevel: parsed.batteryLevel ?? null,
      correctedVolumeVb: parsed.correctedVolumeVb ?? null,
    });
  } catch (err) {
    console.error("[AMR Ingestion] Device threshold check failed:", err);
  }

  try {
    await checkMeterFailureAlarm(deviceId, parsed.readingDate, parsed.correctedVolumeVb, parsed.uncorrectedVolumeVm);
  } catch (err) {
    console.error("[AMR Ingestion] Meter failure check failed:", err);
  }

  return {
    success: true,
    deviceId,
    deviceSerialNo: parsed.deviceSerialNo,
    readingId,
    readingDate: parsed.readingDate.toISOString(),
  };
}

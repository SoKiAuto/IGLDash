import { amrPool } from "@/lib/amr-db";
import { getUtcDayStart, toIsoDate } from "@/lib/financial-calendar";
import crypto from "node:crypto";

export async function checkGasOutOfRangeAlarm(
  deviceId: string,
  readingDate: Date,
  currentVb: number | undefined
): Promise<void> {
  if (currentVb === undefined || currentVb === null) {
    return;
  }

  const alarmDate = getUtcDayStart(readingDate);
  const deviationPercent = 20;
  const deviationWindowDays = 7;

  const windowStart = new Date(alarmDate);
  windowStart.setUTCDate(windowStart.getUTCDate() - deviationWindowDays);

  const historyRes = await amrPool.query(
    `SELECT "readingDate", "correctedVolumeVb"
     FROM "Reading"
     WHERE "deviceId" = $1
       AND "readingDate" >= $2
       AND "readingDate" < $3
       AND "correctedVolumeVb" IS NOT NULL
     ORDER BY "readingDate" DESC, "receivedAt" DESC`,
    [deviceId, windowStart, alarmDate]
  );

  const latestPerDay = new Map<string, number>();
  for (const r of historyRes.rows) {
    const key = new Date(r.readingDate).toISOString().split("T")[0];
    if (!latestPerDay.has(key)) {
      latestPerDay.set(key, Number(r.correctedVolumeVb));
    }
  }

  if (latestPerDay.size < 3) {
    return;
  }

  const values = Array.from(latestPerDay.values());
  const sum = values.reduce((acc, val) => acc + val, 0);
  const average = sum / values.length;

  const deviationFactor = deviationPercent / 100;
  const lowerBound = average * (1 - deviationFactor);
  const upperBound = average * (1 + deviationFactor);

  if (currentVb < lowerBound || currentVb > upperBound) {
    const pctDiff = Math.abs(((currentVb - average) / average) * 100).toFixed(1);
    const direction = currentVb > average ? "above" : "below";
    const cause = `Corrected volume (${currentVb.toFixed(2)} Sm3) is ${pctDiff}% ${direction} the ${deviationWindowDays}-day average (${average.toFixed(2)} Sm3)`;

    const alarmId = crypto.randomUUID();
    await amrPool.query(
      `INSERT INTO "Alarm" (id, "deviceId", type, severity, cause, "gasValue", "averageValue", "forDate", status, acknowledged, "createdAt")
       VALUES ($1, $2, 'GAS_OUT_OF_RANGE', 'WARNING', $3, $4, $5, $6, 'OPEN', false, NOW())
       ON CONFLICT ("deviceId", type, "forDate")
       DO UPDATE SET "gasValue" = EXCLUDED."gasValue", "averageValue" = EXCLUDED."averageValue", cause = EXCLUDED.cause`,
      [alarmId, deviceId, cause, currentVb, average, alarmDate]
    );
  }
}

export async function checkDeviceThresholds(
  deviceId: string,
  readingDate: Date,
  reading: {
    gasPressure?: number | null;
    gasTemperature?: number | null;
    batteryLevel?: number | null;
    correctedVolumeVb?: number | null;
  }
): Promise<void> {
  const alarmDate = getUtcDayStart(readingDate);

  const devRes = await amrPool.query(
    `SELECT "deviceSerialNo", "meterSerialNo", "pressureUpperLimit", "pressureLowerLimit",
            "temperatureUpperLimit", "temperatureLowerLimit", "consumptionUpperLimit",
            "consumptionLowerLimit", "batteryLowerLimit"
     FROM "Device"
     WHERE id = $1`,
    [deviceId]
  );

  const device = devRes.rows[0];
  if (!device) return;

  const breaches: Array<{
    type: string;
    value: number;
    limit: number;
    cause: string;
  }> = [];

  const thresholdBreach = (
    type: string,
    value: number | null | undefined,
    upperLimit: number | null | undefined,
    lowerLimit: number | null | undefined,
    metric: string,
    unit: string
  ) => {
    if (value == null) return;
    if (upperLimit != null && value > upperLimit) {
      breaches.push({
        type,
        value,
        limit: upperLimit,
        cause: `${metric} reading of ${value} ${unit} exceeded the configured upper threshold of ${upperLimit} ${unit} for meter ${device.deviceSerialNo}.`,
      });
    } else if (lowerLimit != null && value < lowerLimit) {
      breaches.push({
        type,
        value,
        limit: lowerLimit,
        cause: `${metric} reading of ${value} ${unit} fell below the configured lower threshold of ${lowerLimit} ${unit} for meter ${device.deviceSerialNo}.`,
      });
    }
  };

  thresholdBreach(
    'PRESSURE_OUT_OF_RANGE',
    reading.gasPressure,
    device.pressureUpperLimit,
    device.pressureLowerLimit,
    "Gas pressure",
    "bar"
  );

  thresholdBreach(
    'TEMPERATURE_OUT_OF_RANGE',
    reading.gasTemperature,
    device.temperatureUpperLimit,
    device.temperatureLowerLimit,
    "Gas temperature",
    "°C"
  );

  let yesterdayReading: number | null | undefined;
  const getYesterdayReading = async (): Promise<number | null> => {
    if (yesterdayReading !== undefined) return yesterdayReading;
    const res = await amrPool.query(
      `SELECT "correctedVolumeVb"
       FROM "Reading"
       WHERE "deviceId" = $1
         AND "readingDate" < $2
         AND "correctedVolumeVb" IS NOT NULL
       ORDER BY "readingDate" DESC, "receivedAt" DESC
       LIMIT 1`,
      [deviceId, alarmDate]
    );
    yesterdayReading = res.rows[0]?.correctedVolumeVb != null ? Number(res.rows[0].correctedVolumeVb) : null;
    return yesterdayReading;
  };

  if (reading.correctedVolumeVb != null && (device.consumptionUpperLimit != null || device.consumptionLowerLimit != null)) {
    const prev = await getYesterdayReading();
    if (prev != null) {
      const dailyConsumption = reading.correctedVolumeVb - prev;
      if (dailyConsumption >= 0) {
        thresholdBreach(
          'CONSUMPTION_OUT_OF_RANGE',
          dailyConsumption,
          device.consumptionUpperLimit,
          device.consumptionLowerLimit,
          "Daily consumption",
          "Sm3"
        );
      }
    }
  }

  if (reading.correctedVolumeVb != null) {
    const prev = await getYesterdayReading();
    if (prev != null) {
      const diff = reading.correctedVolumeVb - prev;
      if (diff === 0) {
        breaches.push({
          type: 'NO_CONSUMPTION',
          value: reading.correctedVolumeVb,
          limit: prev,
          cause: `Corrected volume for meter ${device.deviceSerialNo} is unchanged at ${reading.correctedVolumeVb} Sm3 — no consumption recorded since the previous reading (${prev} Sm3).`,
        });
      }
    }
  }

  if (reading.batteryLevel != null && device.batteryLowerLimit != null && reading.batteryLevel < device.batteryLowerLimit) {
    breaches.push({
      type: 'BATTERY_LOW',
      value: reading.batteryLevel,
      limit: device.batteryLowerLimit,
      cause: `Battery level of ${reading.batteryLevel}% fell below the configured minimum threshold of ${device.batteryLowerLimit}% for meter ${device.deviceSerialNo}.`,
    });
  }

  for (const breach of breaches) {
    const alarmId = crypto.randomUUID();
    await amrPool.query(
      `INSERT INTO "Alarm" (id, "deviceId", type, severity, cause, "gasValue", "averageValue", "forDate", status, acknowledged, "createdAt")
       VALUES ($1, $2, $3::"AlarmType", 'CRITICAL'::"AlarmSeverity", $4, $5, $6, $7, 'OPEN'::"AlarmStatus", false, NOW())
       ON CONFLICT ("deviceId", type, "forDate")
       DO UPDATE SET "gasValue" = EXCLUDED."gasValue", "averageValue" = EXCLUDED."averageValue", cause = EXCLUDED.cause, status = 'OPEN'`,
      [alarmId, deviceId, breach.type, breach.cause, breach.value, breach.limit, alarmDate]
    );
  }
}

export async function checkMeterFailureAlarm(
  deviceId: string,
  readingDate: Date,
  currentVb: number | undefined | null,
  currentVm: number | undefined | null
): Promise<void> {
  if (currentVb == null || currentVm == null) return;

  const alarmDate = getUtcDayStart(readingDate);
  const yesterday = new Date(alarmDate.getTime() - 86_400_000);
  const yesterdayIso = toIsoDate(yesterday);

  const prevRes = await amrPool.query(
    `SELECT "correctedVolumeVb", "uncorrectedVolumeVm"
     FROM "Reading"
     WHERE "deviceId" = $1
       AND "readingDate" < $2
       AND "correctedVolumeVb" IS NOT NULL
       AND "uncorrectedVolumeVm" IS NOT NULL
     ORDER BY "readingDate" DESC, "receivedAt" DESC
     LIMIT 1`,
    [deviceId, alarmDate]
  );

  const prevReading = prevRes.rows[0];
  if (!prevReading) return;

  const prevVb = Number(prevReading.correctedVolumeVb);
  const prevVm = Number(prevReading.uncorrectedVolumeVm);

  const correctedDelta = currentVb - prevVb;
  const uncorrectedDelta = currentVm - prevVm;

  if (correctedDelta < 0 || uncorrectedDelta < 0) return;

  const divergence = uncorrectedDelta - correctedDelta;
  if (divergence < 0.1) return;

  const cause =
    `Meter failure detected for ${yesterdayIso} -> ${alarmDate.toISOString().split("T")[0]}: ` +
    `uncorrected consumption (${uncorrectedDelta.toFixed(3)} m3) exceeds corrected consumption ` +
    `(${correctedDelta.toFixed(3)} Sm3) by ${divergence.toFixed(3)} — threshold is 0.1.`;

  const alarmId = crypto.randomUUID();
  await amrPool.query(
    `INSERT INTO "Alarm" (id, "deviceId", type, severity, cause, "gasValue", "averageValue", "forDate", status, acknowledged, "createdAt")
     VALUES ($1, $2, 'METER_FAILURE'::"AlarmType", 'CRITICAL'::"AlarmSeverity", $3, $4, 0.1, $5, 'OPEN'::"AlarmStatus", false, NOW())
     ON CONFLICT ("deviceId", type, "forDate")
     DO UPDATE SET "gasValue" = EXCLUDED."gasValue", "averageValue" = 0.1, cause = EXCLUDED.cause, status = 'OPEN'`,
    [alarmId, deviceId, cause, divergence, alarmDate]
  );
}

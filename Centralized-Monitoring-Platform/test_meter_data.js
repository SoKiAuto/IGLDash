const { Pool } = require("pg");
require("dotenv").config();

if (!process.env.AMR_DB_URL) {
  console.error("AMR_DB_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.AMR_DB_URL });

function normalizeHourlyConsumption(input) {
  const points = [];
  if (Array.isArray(input)) {
    input.forEach((entry, index) => {
      const hour = entry.hour ?? entry.h ?? (entry.timestamp ? Number(entry.timestamp.match(/(?:T|\s)(\d{2}):/)?.[1] ?? index) : index);
      const value = Number(entry.consumption ?? entry.value ?? entry.v ?? 0);
      points.push({
        hour,
        value,
        timestamp: entry.timestamp,
        pressure: entry.pressure,
        temperature: entry.temperature,
      });
    });
  }
  return points;
}

async function run(deviceId) {
  const devRes = await pool.query(`
    SELECT
      d.*,
      c.name as "customerName",
      ga.name as "gaName"
    FROM "Device" d
    LEFT JOIN "Customer" c ON c.id = d."customerId"
    LEFT JOIN "GeographicalArea" ga ON ga.id = c."gaId"
    WHERE d.id = $1 OR d."deviceSerialNo" = $1
    LIMIT 1
  `, [deviceId]);

  const device = devRes.rows[0];
  if (!device) {
    console.log(`Device ${deviceId} not found.`);
    await pool.end();
    return;
  }

  const readingRes = await pool.query(`
    SELECT * FROM "Reading" WHERE "deviceId" = $1 ORDER BY "readingDate" DESC LIMIT 2
  `, [device.id]);

  const latest = readingRes.rows[0] ?? null;
  const previous = readingRes.rows[1] ?? null;

  const todayCorrected =
    latest && previous && latest.correctedVolumeVb !== null && previous.correctedVolumeVb !== null
      ? Math.max(0, Number(latest.correctedVolumeVb) - Number(previous.correctedVolumeVb))
      : (latest?.correctedVolumeVb ? Number(latest.correctedVolumeVb) : null);

  const todayUncorrected =
    latest && previous && latest.uncorrectedVolumeVm !== null && previous.uncorrectedVolumeVm !== null
      ? Math.max(0, Number(latest.uncorrectedVolumeVm) - Number(previous.uncorrectedVolumeVm))
      : (latest?.uncorrectedVolumeVm ? Number(latest.uncorrectedVolumeVm) : null);

  const correctionFactorC =
    latest?.correctedVolumeVb != null && latest?.uncorrectedVolumeVm != null && Number(latest.uncorrectedVolumeVm) > 0
      ? Number(latest.correctedVolumeVb) / Number(latest.uncorrectedVolumeVm)
      : (latest?.correctionFactorC != null ? Number(latest.correctionFactorC) : null);

  const latestReading = latest
    ? {
      id: latest.id,
      readingDate: new Date(latest.readingDate).toISOString(),
      correctedVolumeVb: latest.correctedVolumeVb != null ? Number(latest.correctedVolumeVb) : null,
      uncorrectedVolumeVm: latest.uncorrectedVolumeVm != null ? Number(latest.uncorrectedVolumeVm) : null,
      gasPressure: latest.gasPressure != null ? Number(latest.gasPressure) : null,
      pressureMax: latest.pressureMax != null ? Number(latest.pressureMax) : null,
      pressureMin: latest.pressureMin != null ? Number(latest.pressureMin) : null,
      gasTemperature: latest.gasTemperature != null ? Number(latest.gasTemperature) : null,
      temperatureMax: latest.temperatureMax != null ? Number(latest.temperatureMax) : null,
      temperatureMin: latest.temperatureMin != null ? Number(latest.temperatureMin) : null,
      compressibilityZ: latest.compressibilityZ != null ? Number(latest.compressibilityZ) : null,
      compressibilityFpv: latest.compressibilityFpv != null ? Number(latest.compressibilityFpv) : null,
      correctionFactorC,
      gasDensity: latest.gasDensity != null ? Number(latest.gasDensity) : null,
      hourlyConsumption: latest.hourlyConsumption ? normalizeHourlyConsumption(latest.hourlyConsumption) : null,
      batteryLevel: latest.batteryLevel != null ? Number(latest.batteryLevel) : null,
    }
    : null;

  const result = {
    device,
    latestReading,
    latest: latestReading,
    todayVolumeDelta: todayCorrected,
    todayUncorrectedVolumeDelta: todayUncorrected,
  };

  console.log("Device:", result.device.deviceSerialNo);
  console.log("todayVolumeDelta:", result.todayVolumeDelta);
  console.log("todayUncorrectedVolumeDelta:", result.todayUncorrectedVolumeDelta);
  console.log("latestReading gasPressure:", result.latestReading?.gasPressure, "temperature:", result.latestReading?.gasTemperature, "vb:", result.latestReading?.correctedVolumeVb);

  const hourlyRes = await pool.query(`
    SELECT "readingDate", "hourlyConsumption"
    FROM "Reading"
    WHERE "deviceId" = $1 AND jsonb_typeof("hourlyConsumption") = 'array'
    ORDER BY "readingDate" DESC
    LIMIT 1
  `, [device.id]);
  const hRow = hourlyRes.rows[0];
  if (!hRow) {
    console.log("No hourly consumption stored for this device.");
    await pool.end();
    return;
  }
  const hPoints = normalizeHourlyConsumption(hRow.hourlyConsumption);
  const hourlyData = {
    date: new Date(hRow.readingDate).toISOString().split("T")[0],
    hourlyConsumption: hPoints,
  };
  console.log("Hourly date:", hourlyData.date, "Points count:", hourlyData.hourlyConsumption.length);
  console.log("Sample point:", hourlyData.hourlyConsumption[0]);
  await pool.end();
}
run(process.argv[2] ?? "DEMO-1801").catch((err) => {
  console.error(err.message);
  process.exit(1);
});

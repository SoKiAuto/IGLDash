const { Pool } = require("pg");

const amrSource = new Pool({
  connectionString: "postgresql://neondb_owner:npg_8DirE9JelcOk@ep-rapid-pine-azkeusda-pooler.c-3.ap-southeast-1.aws.neon.tech/meter_rd_db?sslmode=require"
});

const iglTarget = new Pool({
  connectionString: "postgresql://IGLDashDB_owner:npg_pe0NHhR1wGgb@ep-empty-queen-a1u8n9c7-pooler.ap-southeast-1.aws.neon.tech/IGLDashDB?sslmode=require"
});

async function sync() {
  console.log("Checking tables in IGLDashDB...");
  
  // Create ENUM types if not exist
  await iglTarget.query(`
    DO $$ BEGIN
      CREATE TYPE "CustomerCategory" AS ENUM ('COMMERCIAL', 'RESIDENTIAL', 'DRS', 'INDUSTRIAL_CNG', 'INDUSTRIAL_PNG');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "AlarmType" AS ENUM ('MISSING_DATA', 'GAS_OUT_OF_RANGE', 'PRESSURE_OUT_OF_RANGE', 'TEMPERATURE_OUT_OF_RANGE', 'CONSUMPTION_OUT_OF_RANGE', 'BATTERY_LOW', 'NO_CONSUMPTION', 'METER_FAILURE');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "AlarmSeverity" AS ENUM ('CRITICAL', 'WARNING');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "AlarmStatus" AS ENUM ('OPEN', 'RESOLVED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // Create tables in IGLDashDB
  await iglTarget.query(`
    CREATE TABLE IF NOT EXISTS "GeographicalArea" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE,
      "parentId" TEXT REFERENCES "GeographicalArea"(id),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "Customer" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      "gaId" TEXT NOT NULL REFERENCES "GeographicalArea"(id),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "Device" (
      id TEXT PRIMARY KEY,
      "deviceSerialNo" TEXT UNIQUE NOT NULL,
      "customerId" TEXT REFERENCES "Customer"(id),
      category "CustomerCategory",
      "meterSerialNo" TEXT,
      "meterSize" TEXT,
      "firmwareVersion" TEXT,
      "hardwareVersion" TEXT,
      "deviceModel" TEXT,
      "configurationVersion" TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeenAt" TIMESTAMP(3),
      "batteryLowerLimit" DOUBLE PRECISION,
      "consumptionLowerLimit" DOUBLE PRECISION,
      "consumptionUpperLimit" DOUBLE PRECISION,
      "pressureLowerLimit" DOUBLE PRECISION,
      "pressureUpperLimit" DOUBLE PRECISION,
      "temperatureLowerLimit" DOUBLE PRECISION,
      "temperatureUpperLimit" DOUBLE PRECISION
    );

    CREATE TABLE IF NOT EXISTS "Reading" (
      id TEXT PRIMARY KEY,
      "deviceId" TEXT NOT NULL REFERENCES "Device"(id),
      "readingDate" TIMESTAMP(3) NOT NULL,
      "correctedVolumeVb" DOUBLE PRECISION,
      "uncorrectedVolumeVm" DOUBLE PRECISION,
      "gasPressure" DOUBLE PRECISION,
      "pressureMax" DOUBLE PRECISION,
      "pressureMin" DOUBLE PRECISION,
      "gasTemperature" DOUBLE PRECISION,
      "temperatureMax" DOUBLE PRECISION,
      "temperatureMin" DOUBLE PRECISION,
      "compressibilityZ" DOUBLE PRECISION,
      "compressibilityFpv" DOUBLE PRECISION,
      "correctionFactorC" DOUBLE PRECISION,
      "gasDensity" DOUBLE PRECISION,
      "hourlyConsumption" JSONB,
      "batteryLevel" DOUBLE PRECISION,
      "currentFlowRate" DOUBLE PRECISION,
      "rawPayload" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "Alarm" (
      id TEXT PRIMARY KEY,
      "deviceId" TEXT NOT NULL REFERENCES "Device"(id),
      type "AlarmType" NOT NULL,
      severity "AlarmSeverity" NOT NULL,
      cause TEXT NOT NULL,
      "gasValue" DOUBLE PRECISION,
      "averageValue" DOUBLE PRECISION,
      "forDate" TIMESTAMP(3) NOT NULL,
      status "AlarmStatus" NOT NULL DEFAULT 'OPEN',
      acknowledged BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "acknowledgedAt" TIMESTAMP(3)
    );
  `);
  console.log("Tables created in IGLDashDB.");

  // Check if data already exists in Customer
  const countCheck = await iglTarget.query('SELECT COUNT(*)::int as count FROM "Customer"');
  if (countCheck.rows[0].count === 0) {
    console.log("Migrating data from meter_rd_db to IGLDashDB...");

    // Copy GeographicalArea
    const gaRows = (await amrSource.query('SELECT * FROM "GeographicalArea"')).rows;
    for (const r of gaRows) {
      await iglTarget.query(
        'INSERT INTO "GeographicalArea" (id, name, code, "parentId", "createdAt") VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
        [r.id, r.name, r.code, r.parentId, r.createdAt]
      );
    }
    console.log(`Synced ${gaRows.length} GeographicalArea rows.`);

    // Copy Customer
    const custRows = (await amrSource.query('SELECT * FROM "Customer"')).rows;
    for (const r of custRows) {
      await iglTarget.query(
        'INSERT INTO "Customer" (id, name, address, "gaId", "createdAt") VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
        [r.id, r.name, r.address, r.gaId, r.createdAt]
      );
    }
    console.log(`Synced ${custRows.length} Customer rows.`);

    // Copy Device
    const devRows = (await amrSource.query('SELECT * FROM "Device"')).rows;
    for (const r of devRows) {
      await iglTarget.query(
        `INSERT INTO "Device" (
          id, "deviceSerialNo", "customerId", category, "meterSerialNo", "meterSize",
          "firmwareVersion", "hardwareVersion", "deviceModel", "configurationVersion",
          latitude, longitude, "firstSeenAt", "lastSeenAt", "batteryLowerLimit",
          "consumptionLowerLimit", "consumptionUpperLimit", "pressureLowerLimit",
          "pressureUpperLimit", "temperatureLowerLimit", "temperatureUpperLimit"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) ON CONFLICT (id) DO NOTHING`,
        [
          r.id, r.deviceSerialNo, r.customerId, r.category, r.meterSerialNo, r.meterSize,
          r.firmwareVersion, r.hardwareVersion, r.deviceModel, r.configurationVersion,
          r.latitude, r.longitude, r.firstSeenAt, r.lastSeenAt, r.batteryLowerLimit,
          r.consumptionLowerLimit, r.consumptionUpperLimit, r.pressureLowerLimit,
          r.pressureUpperLimit, r.temperatureLowerLimit, r.temperatureUpperLimit
        ]
      );
    }
    console.log(`Synced ${devRows.length} Device rows.`);

    // Copy Readings
    const readingRows = (await amrSource.query('SELECT * FROM "Reading" ORDER BY "readingDate" ASC')).rows;
    for (const r of readingRows) {
      await iglTarget.query(
        `INSERT INTO "Reading" (
          id, "deviceId", "readingDate", "correctedVolumeVb", "uncorrectedVolumeVm",
          "gasPressure", "pressureMax", "pressureMin", "gasTemperature", "temperatureMax",
          "temperatureMin", "compressibilityZ", "compressibilityFpv", "correctionFactorC",
          "gasDensity", "hourlyConsumption", "batteryLevel", "currentFlowRate", "rawPayload", "receivedAt"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) ON CONFLICT (id) DO NOTHING`,
        [
          r.id, r.deviceId, r.readingDate, r.correctedVolumeVb, r.uncorrectedVolumeVm,
          r.gasPressure, r.pressureMax, r.pressureMin, r.gasTemperature, r.temperatureMax,
          r.temperatureMin, r.compressibilityZ, r.compressibilityFpv, r.correctionFactorC,
          r.gasDensity, JSON.stringify(r.hourlyConsumption), r.batteryLevel, r.currentFlowRate,
          JSON.stringify(r.rawPayload), r.receivedAt
        ]
      );
    }
    console.log(`Synced ${readingRows.length} Reading rows.`);

    // Copy Alarms
    const alarmRows = (await amrSource.query('SELECT * FROM "Alarm" ORDER BY "createdAt" ASC')).rows;
    for (const r of alarmRows) {
      await iglTarget.query(
        `INSERT INTO "Alarm" (
          id, "deviceId", type, severity, cause, "gasValue", "averageValue",
          "forDate", status, acknowledged, "createdAt", "acknowledgedAt"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
        [
          r.id, r.deviceId, r.type, r.severity, r.cause, r.gasValue, r.averageValue,
          r.forDate, r.status, r.acknowledged, r.createdAt, r.acknowledgedAt
        ]
      );
    }
    console.log(`Synced ${alarmRows.length} Alarm rows.`);
  } else {
    console.log("Customer data already in IGLDashDB.");
  }

  await amrSource.end();
  await iglTarget.end();
  console.log("Sync complete!");
}

sync().catch(console.error);
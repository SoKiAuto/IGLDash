import "dotenv/config";
import { processIngestPayload } from "../lib/amr-ingest";
import { amrPool } from "../lib/amr-db";

async function main() {
  const testPayload = {
    deviceSerialNo: "TEST-EVC-" + Math.floor(1000 + Math.random() * 9000),
    meterSerialNo: "MTR-TEST-1",
    meterSize: "G4",
    firmwareVersion: "v1.2.0",
    readingDate: new Date().toISOString().split("T")[0],
    volume: {
      correctedVb: 15420.55,
      uncorrectedVm: 15100.22,
    },
    pressure: {
      value: 24.5,
      max: 26.0,
      min: 21.0,
    },
    temperature: {
      value: 42.0,
    },
    batteryLevel: 85,
    currentFlowRate: 12.3,
  };

  console.log("Testing AMR Ingestion with payload for device:", testPayload.deviceSerialNo);

  try {
    const result = await processIngestPayload(testPayload);
    console.log("Ingestion result:", result);

    const devCheck = await amrPool.query(
      'SELECT id, "deviceSerialNo", "meterSerialNo", "lastSeenAt" FROM "Device" WHERE "deviceSerialNo" = $1',
      [testPayload.deviceSerialNo]
    );
    console.log("Device in DB:", devCheck.rows[0]);

    const readCheck = await amrPool.query(
      'SELECT id, "readingDate", "correctedVolumeVb", "gasPressure" FROM "Reading" WHERE id = $1',
      [result.readingId]
    );
    console.log("Reading in DB:", readCheck.rows[0]);

    // Clean up test records
    await amrPool.query('DELETE FROM "Reading" WHERE "deviceId" = $1', [result.deviceId]);
    await amrPool.query('DELETE FROM "Device" WHERE id = $1', [result.deviceId]);
    console.log("Cleaned up test device and reading.");
    console.log("AMR Ingestion test passed successfully!");
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await amrPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

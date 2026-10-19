import { after, NextRequest, NextResponse } from "next/server";
import { processIngestPayload } from "@/lib/amr-ingest";

const MAX_INGEST_BODY_BYTES = 1_048_576; // 1MB

export async function POST(req: NextRequest) {
  try {
    // Secret verification (if configured in env)
    const expectedSecret = process.env.INGESTION_SECRET;
    if (process.env.NODE_ENV === "production" && !expectedSecret) {
      return NextResponse.json({ error: "Ingestion authentication is not configured." }, { status: 503 });
    }
    if (expectedSecret) {
      const providedSecret = req.headers.get("x-ingestion-secret");
      if (providedSecret !== expectedSecret) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid or missing x-ingestion-secret header" },
          { status: 401 }
        );
      }
    }

    const declaredLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_INGEST_BODY_BYTES) {
      return NextResponse.json({ error: "Ingestion payload is too large." }, { status: 413 });
    }

    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return NextResponse.json(
        { error: "Unable to read ingestion request body." },
        { status: 400 }
      );
    }

    if (Buffer.byteLength(rawBody, "utf8") > MAX_INGEST_BODY_BYTES) {
      return NextResponse.json({ error: "Ingestion payload is too large." }, { status: 413 });
    }

    after(async () => {
      try {
        const body: unknown = JSON.parse(rawBody);
        const result = await processIngestPayload(body);
        console.log("[AMR Ingestion] Processed payload successfully:", {
          deviceId: result.deviceId,
          deviceSerialNo: result.deviceSerialNo,
          readingId: result.readingId,
        });
      } catch (error) {
        console.error(
          "[AMR Ingestion] Background processing failed:",
          error instanceof Error ? error.message : error
        );
      }
    });

    return NextResponse.json(
      { success: true, accepted: true, message: "Ingestion accepted for processing." },
      { status: 202 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to accept ingestion request." },
      { status: 500 }
    );
  }
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

function getAuthHeaders() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!apiKey || !connectionKey) {
    throw new Error("Google Sheets not connected. Link the connector in Settings.");
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

/** Check whether the Google Sheets connector is linked to this project. */
export const checkSheetsConnection = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      getAuthHeaders();
      return { connected: true };
    } catch {
      return { connected: false };
    }
  },
);

/** Append scans to the configured Google Sheet. Adds a header row if the sheet is empty. */
export const syncToSheets = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      scans: z.array(
        z.object({
          meterSerial: z.string(),
          dcuId: z.string(),
          boxId: z.string(),
          scanDateTime: z.string(),
          status: z.string(),
          notes: z.string().default(""),
        }),
      ),
      spreadsheetId: z.string(),
      sheetName: z.string(),
      columnNames: z.object({
        meterSerial: z.string(),
        dcuId: z.string(),
        boxId: z.string(),
        scanDateTime: z.string(),
        status: z.string(),
        notes: z.string(),
      }),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const headers = getAuthHeaders();
    const { spreadsheetId, sheetName, scans, columnNames } = data;

    // Read the first row to check if headers exist
    const headerRange = `${sheetName}!1:1`;
    const headerUrl = `${GATEWAY_URL}/spreadsheets/${spreadsheetId}/values/${headerRange}`;
    const headerResp = await fetch(headerUrl, { headers });
    let needHeaders = true;
    if (headerResp.ok) {
      const headerResult = await headerResp.json();
      if (headerResult.values?.[0]?.length > 0) {
        needHeaders = false;
      }
    }

    const values: string[][] = scans.map((s) => [
      s.meterSerial,
      s.dcuId,
      s.boxId,
      s.scanDateTime,
      s.status,
      s.notes || "",
    ]);

    if (needHeaders) {
      values.unshift([
        columnNames.meterSerial,
        columnNames.dcuId,
        columnNames.boxId,
        columnNames.scanDateTime,
        columnNames.status,
        columnNames.notes,
      ]);
    }

    const range = `${sheetName}!A:F`;
    const appendUrl = `${GATEWAY_URL}/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
    const response = await fetch(appendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ values }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Sheets sync failed [${response.status}]: ${errorBody}`);
      throw new Error(`Sync failed [${response.status}]: ${errorBody}`);
    }

    return { success: true, count: scans.length, addedHeaders: needHeaders };
  });

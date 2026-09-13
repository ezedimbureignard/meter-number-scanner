import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

function getAuthHeaders() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!apiKey || !connectionKey) {
    throw new Error("Google Sheets is not connected yet.");
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

const sheetRefSchema = z.object({
  spreadsheetId: z.string(),
  sheetName: z.string(),
});

/**
 * Pull the DCU list, existing meter serials, and last carton number
 * straight from the spreadsheet.
 * Sheet layout: A = Carton No., B = Meter Number, C = DCU Location.
 */
export const fetchSheetData = createServerFn({ method: "POST" })
  .inputValidator((data) => sheetRefSchema.parse(data))
  .handler(async ({ data }) => {
    const headers = getAuthHeaders();
    const { spreadsheetId, sheetName } = data;

    const range = `${sheetName}!A1:C5000`;
    const url = `${GATEWAY_URL}/spreadsheets/${spreadsheetId}/values/${range}`;

    let response = await fetch(url, { headers });
    // The spreadsheet service limits how often it can be read; wait once and retry.
    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      response = await fetch(url, { headers });
    }

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Sheets read failed [${response.status}]: ${errorBody}`);
      if (response.status === 429) {
        throw new Error("The spreadsheet is busy right now — try again shortly.");
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "No access to the spreadsheet. Reconnect your Google account and make sure this sheet is shared with it.",
        );
      }
      throw new Error(`Could not read the sheet [${response.status}]`);
    }

    const result = (await response.json()) as { values?: string[][] };
    const rows = result.values ?? [];

    const dcus: string[] = [];
    const serials: string[] = [];
    const cartons: string[] = [];

    // Skip the header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const carton = (row[0] ?? "").trim();
      const serial = (row[1] ?? "").trim();
      const dcu = (row[2] ?? "").trim();

      if (dcu && !dcus.includes(dcu)) dcus.push(dcu);
      if (serial) serials.push(serial);
      if (carton && !cartons.includes(carton)) cartons.push(carton);
    }

    const numericCartons = cartons
      .map((c) => parseInt(c, 10))
      .filter((n) => !Number.isNaN(n));
    const lastCarton = numericCartons.length ? Math.max(...numericCartons) : 0;

    return { dcus, serials, lastCarton, rowCount: rows.length };
  });

/**
 * Append scans to the sheet using its native layout:
 * carton number only on the first row of each carton group.
 */
export const syncToSheets = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        scans: z.array(
          z.object({
            meterSerial: z.string(),
            dcuId: z.string(),
            boxId: z.string(),
          }),
        ),
        spreadsheetId: z.string(),
        sheetName: z.string(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const headers = getAuthHeaders();
    const { spreadsheetId, sheetName, scans } = data;

    if (scans.length === 0) {
      return { success: true, count: 0, skipped: 0 };
    }

    // Read existing serials so we never write a duplicate
    const readUrl = `${GATEWAY_URL}/spreadsheets/${spreadsheetId}/values/${sheetName}!B1:B5000`;
    const readResp = await fetch(readUrl, { headers });
    const existing = new Set<string>();
    if (readResp.ok) {
      const body = (await readResp.json()) as { values?: string[][] };
      for (const row of body.values ?? []) {
        const v = (row[0] ?? "").trim();
        if (v) existing.add(v);
      }
    }

    const fresh = scans.filter((s) => !existing.has(s.meterSerial.trim()));
    const skipped = scans.length - fresh.length;

    if (fresh.length === 0) {
      return { success: true, count: 0, skipped };
    }

    // Build rows; carton + DCU shown only when they change (matches the sheet)
    const values: string[][] = [];
    let lastCarton = "";
    let lastDcu = "";
    for (const s of fresh) {
      const cartonCell = s.boxId !== lastCarton ? s.boxId : "";
      const dcuCell = s.dcuId !== lastDcu ? s.dcuId : "";
      values.push([cartonCell, s.meterSerial, dcuCell]);
      lastCarton = s.boxId;
      lastDcu = s.dcuId;
    }

    const appendUrl = `${GATEWAY_URL}/spreadsheets/${spreadsheetId}/values/${sheetName}!A:C:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
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

    return { success: true, count: fresh.length, skipped };
  });

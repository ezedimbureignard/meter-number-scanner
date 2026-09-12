/**
 * Meter serials are sometimes written with a leading zero in the barcode
 * ("058105403255") but stored without it in the sheet ("58105403255").
 * Normalise so duplicate detection matches either way.
 */
export function normalizeSerial(raw: string): string {
  return raw.trim().replace(/\s+/g, "").replace(/^0+/, "");
}

/** Pull the meter serial out of a scanned payload (handles URL/CSV payloads). */
export function extractSerial(raw: string): string {
  const text = raw.trim();
  // Longest run of 8+ digits wins — that's the meter number
  const matches = text.match(/\d{8,}/g);
  if (matches && matches.length > 0) {
    return matches.sort((a, b) => b.length - a.length)[0]!;
  }
  return text;
}

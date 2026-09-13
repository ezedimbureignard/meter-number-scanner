import type { MeterScan, ColumnConfig } from "./types";
import { STATUS_LABELS } from "./types";

/**
 * Export scans to an .xlsx file and trigger a download.
 * Uses dynamic import so xlsx is only loaded in the browser.
 */
function cartonNumber(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && value.trim() !== "" ? numeric : Number.MAX_SAFE_INTEGER;
}

/** Orders cartons numerically from the lowest carton number through the highest. */
export function sortByCarton(scans: MeterScan[]) {
  return [...scans].sort((a, b) => cartonNumber(a.boxId) - cartonNumber(b.boxId) || a.boxId.localeCompare(b.boxId, undefined, { numeric: true }) || a.scanDateTime.localeCompare(b.scanDateTime));
}

export async function exportToExcel(scans: MeterScan[], columns: ColumnConfig, filename?: string) {
  const XLSX = await import("xlsx");

  const rows = sortByCarton(scans).map((s) => ({
    [columns.meterSerial]: s.meterSerial,
    [columns.dcuId]: s.dcuId,
    [columns.boxId]: s.boxId,
    [columns.scanDateTime]: new Date(s.scanDateTime).toLocaleString(),
    [columns.status]: STATUS_LABELS[s.status] ?? s.status,
    [columns.notes]: s.notes ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [
      columns.meterSerial,
      columns.dcuId,
      columns.boxId,
      columns.scanDateTime,
      columns.status,
      columns.notes,
    ],
  });

  const colWidths = [
    columns.meterSerial,
    columns.dcuId,
    columns.boxId,
    columns.scanDateTime,
    columns.status,
    columns.notes,
  ].map((header) => {
    const maxLen = Math.max(
      header.length,
      ...rows.map((r) => String(r[header as keyof typeof r] ?? "").length),
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Meter Inventory");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, filename ?? `meter-inventory-${date}.xlsx`);
}

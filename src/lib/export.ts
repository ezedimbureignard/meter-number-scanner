import type { MeterScan, ColumnConfig } from "./types";
import { STATUS_LABELS } from "./types";

/**
 * Export scans to an .xlsx file and trigger a download.
 * Uses dynamic import so xlsx is only loaded in the browser.
 */
export async function exportToExcel(scans: MeterScan[], columns: ColumnConfig) {
  const XLSX = await import("xlsx");

  const rows = scans.map((s) => ({
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
  XLSX.writeFile(wb, `meter-inventory-${date}.xlsx`);
}

export type ScanStatus = "pending" | "assigned" | "verified";

export interface MeterScan {
  id: string;
  meterSerial: string;
  dcuId: string;
  boxId: string;
  scanDateTime: string;
  status: ScanStatus;
  notes?: string;
}

export interface DCU {
  id: string;
  name: string;
}

export interface ColumnConfig {
  meterSerial: string;
  dcuId: string;
  boxId: string;
  scanDateTime: string;
  status: string;
  notes: string;
}

export interface AppSettings {
  soundEnabled: boolean;
  autoScan: boolean;
  vibrateOnScan: boolean;
  spreadsheetId: string;
  sheetName: string;
  columnConfig: ColumnConfig;
}

export const STATUS_LABELS: Record<ScanStatus, string> = {
  pending: "Pending",
  assigned: "Assigned",
  verified: "Verified",
};

export const STATUS_COLORS: Record<ScanStatus, string> = {
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  assigned: "bg-primary/15 text-primary border-primary/30",
  verified: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

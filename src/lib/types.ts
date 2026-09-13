export type ScanStatus = "pending" | "assigned" | "verified";

export interface MeterScan {
  id: string;
  meterSerial: string;
  dcuId: string;
  boxId: string;
  scanDateTime: string;
  status: ScanStatus;
  notes?: string;
  sessionId?: string;
  bulkCarton?: boolean;
  sheetsExportedAt?: string;
}

export interface ScanSession {
  id: string;
  operator: string;
  site: string;
  shift: string;
  notes?: string;
  startedAt: string;
  endedAt?: string;
}

export interface CartonManifest {
  id: string;
  boxId: string;
  dcuId: string;
  expectedSerials: string[];
  createdAt: string;
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
  /** Minimum time between camera-detected scans, in milliseconds. */
  autoScanDelayMs: number;
  vibrateOnScan: boolean;
  spreadsheetId: string;
  sheetName: string;
  columnConfig: ColumnConfig;
  activeSessionId?: string;
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

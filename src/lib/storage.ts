import type { MeterScan, DCU, AppSettings, ScanSession, CartonManifest } from "./types";

const SCANS_KEY = "metertrack_scans";
const DCUS_KEY = "metertrack_dcus";
const SETTINGS_KEY = "metertrack_settings";
const SESSIONS_KEY = "metertrack_sessions";
const MANIFESTS_KEY = "metertrack_manifests";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

/* ── Scans ── */

export function getScans(): MeterScan[] {
  return read<MeterScan[]>(SCANS_KEY, []);
}

export function saveScans(scans: MeterScan[]) {
  write(SCANS_KEY, scans);
}

export function addScan(scan: MeterScan): MeterScan[] {
  const scans = getScans();
  scans.unshift(scan);
  saveScans(scans);
  return scans;
}

export function addScans(newScans: MeterScan[]): MeterScan[] {
  const scans = [...newScans.reverse(), ...getScans()];
  saveScans(scans);
  return scans;
}

export function updateScan(id: string, updates: Partial<MeterScan>): MeterScan[] {
  const scans = getScans();
  const idx = scans.findIndex((s) => s.id === id);
  if (idx !== -1) {
    scans[idx] = { ...scans[idx], ...updates } as MeterScan;
    saveScans(scans);
  }
  return scans;
}

export function deleteScan(id: string): MeterScan[] {
  const scans = getScans().filter((s) => s.id !== id);
  saveScans(scans);
  return scans;
}

export function deleteScansByBox(boxId: string): MeterScan[] {
  const scans = getScans().filter((s) => s.boxId !== boxId);
  saveScans(scans);
  return scans;
}

export function clearAllScans() {
  saveScans([]);
}

/* ── Sessions ── */

export function getSessions(): ScanSession[] {
  return read<ScanSession[]>(SESSIONS_KEY, []);
}

export function saveSessions(sessions: ScanSession[]) {
  write(SESSIONS_KEY, sessions);
}

export function addSession(session: ScanSession) {
  const sessions = [session, ...getSessions()];
  saveSessions(sessions);
  return sessions;
}

export function updateSession(id: string, updates: Partial<ScanSession>) {
  const sessions = getSessions().map((session) =>
    session.id === id ? { ...session, ...updates } : session,
  );
  saveSessions(sessions);
  return sessions;
}

/* ── Carton manifests ── */

export function getManifests(): CartonManifest[] {
  return read<CartonManifest[]>(MANIFESTS_KEY, []);
}

export function saveManifest(manifest: CartonManifest) {
  const manifests = getManifests();
  const existing = manifests.findIndex((item) => item.boxId === manifest.boxId);
  if (existing === -1) manifests.unshift(manifest);
  else manifests[existing] = manifest;
  write(MANIFESTS_KEY, manifests);
  return manifests;
}

export function deleteManifest(id: string) {
  const manifests = getManifests().filter((item) => item.id !== id);
  write(MANIFESTS_KEY, manifests);
  return manifests;
}

/* ── DCUs ── */

export function getDCUs(): DCU[] {
  return read<DCU[]>(DCUS_KEY, []);
}

export function saveDCUs(dcus: DCU[]) {
  write(DCUS_KEY, dcus);
}

export function addDCU(dcu: DCU) {
  const dcus = getDCUs();
  if (!dcus.some((d) => d.id === dcu.id)) {
    dcus.push(dcu);
    saveDCUs(dcus);
  }
  return dcus;
}

export function removeDCU(id: string) {
  const dcus = getDCUs().filter((d) => d.id !== id);
  saveDCUs(dcus);
  return dcus;
}

/* ── Settings ── */

export function getDefaultSettings(): AppSettings {
  return {
    soundEnabled: true,
    autoScan: false,
    vibrateOnScan: true,
    spreadsheetId: "1cOFjCoh29CH7_Vsdc-plSrvP93eVXfoB2lEDiJPk8ps",
    sheetName: "Transfered to Office",
    columnConfig: {
      meterSerial: "Meter Serial Number",
      dcuId: "DCU ID",
      boxId: "Box/Carton ID",
      scanDateTime: "Scan Date/Time",
      status: "Status",
      notes: "Notes",
    },
  };
}

export function getSettings(): AppSettings {
  return { ...getDefaultSettings(), ...read<Partial<AppSettings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(settings: AppSettings) {
  write(SETTINGS_KEY, settings);
}

/* ── Helpers ── */

export function createScan(
  meterSerial: string,
  dcuId: string,
  boxId: string,
  status: MeterScan["status"] = "assigned",
  notes = "",
  sessionId?: string,
): MeterScan {
  return {
    id: crypto.randomUUID(),
    meterSerial,
    dcuId,
    boxId,
    scanDateTime: new Date().toISOString(),
    status,
    notes,
    ...(sessionId ? { sessionId } : {}),
  };
}

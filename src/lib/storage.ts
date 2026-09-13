import type { MeterScan, DCU, AppSettings, ScanSession, CartonManifest, AppUser, UserRole } from "./types";

const SCANS_KEY = "metertrack_scans";
const DCUS_KEY = "metertrack_dcus";
const SETTINGS_KEY = "metertrack_settings";
const SESSIONS_KEY = "metertrack_sessions";
const MANIFESTS_KEY = "metertrack_manifests";
const USERS_KEY = "metertrack_users";
const CURRENT_USER_KEY = "metertrack_current_user";

export const MASTER_DCU_SITES = ["Wuese", "Lobi", "Utonkon", "Uduo", "Orakamu", "Adabu", "Udeni", "Assakio", "Ajio Shangev-Ya", "Azara Maisamri", "Saminaka", "Betse"];

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
  const user = getCurrentUser();
  const scans = read<MeterScan[]>(SCANS_KEY, []);
  if (!user || user.enabled === false) return [];
  return user.role === "standard" ? scans.filter((scan) => scan.dcuId === user.assignedDcuId) : scans;
}

function getAllScans(): MeterScan[] { return read<MeterScan[]>(SCANS_KEY, []); }

function requireAdmin() {
  if (getCurrentUser()?.role !== "admin") throw new Error("Administrator permission required");
}

function requireLocationAccess(dcuId: string) {
  const user = getCurrentUser();
  if (!user) throw new Error("Sign in is required");
  if (!user.enabled) throw new Error("This user account is disabled");
  if (user.role === "standard" && user.assignedDcuId !== dcuId) throw new Error("You are not assigned to this DCU location");
}

export function saveScans(scans: MeterScan[]) {
  write(SCANS_KEY, scans);
}

export function addScan(scan: MeterScan): MeterScan[] {
  requireLocationAccess(scan.dcuId);
  const settings = getSettings();
  const scans = getAllScans();
  const cartonCount = scans.filter((item) => item.dcuId === scan.dcuId && item.boxId === scan.boxId).length;
  if (cartonCount >= settings.metersPerCarton) throw new Error(`The scan limit of ${settings.metersPerCarton} has been reached for this carton`);
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
  requireAdmin();
  const scans = getAllScans();
  const idx = scans.findIndex((s) => s.id === id);
  if (idx !== -1) {
    scans[idx] = { ...scans[idx], ...updates } as MeterScan;
    saveScans(scans);
  }
  return scans;
}

export function deleteScan(id: string): MeterScan[] {
  requireAdmin();
  const scans = getAllScans().filter((s) => s.id !== id);
  saveScans(scans);
  return scans;
}

export function markScansExported(ids: string): MeterScan[];
export function markScansExported(ids: string[]): MeterScan[];
export function markScansExported(ids: string | string[]): MeterScan[] {
  const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
  const scans = getScans().map((scan) =>
    idSet.has(scan.id) ? { ...scan, sheetsExportedAt: new Date().toISOString() } : scan,
  );
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
  const existing = read<DCU[]>(DCUS_KEY, []);
  const master = MASTER_DCU_SITES.map((name) => existing.find((dcu) => dcu.id === name) ?? ({ id: name, name, site: name, active: true }));
  return [...master, ...existing.filter((dcu) => !master.some((site) => site.id === dcu.id))];
}

export function saveDCUs(dcus: DCU[]) {
  write(DCUS_KEY, dcus);
}

export function addDCU(dcu: DCU) {
  requireAdmin();
  const dcus = getDCUs();
  if (!dcus.some((d) => d.id === dcu.id)) {
    dcus.push(dcu);
    saveDCUs(dcus);
  }
  return dcus;
}

export function removeDCU(id: string) {
  requireAdmin();
  const dcus = read<DCU[]>(DCUS_KEY, []);
  if (MASTER_DCU_SITES.includes(id)) {
    const index = dcus.findIndex((dcu) => dcu.id === id);
    if (index === -1) dcus.push({ id, name: id, site: id, active: false });
    else dcus[index] = { ...dcus[index], active: false };
  } else {
    const index = dcus.findIndex((dcu) => dcu.id === id);
    if (index !== -1) dcus[index] = { ...dcus[index], active: false };
  }
  saveDCUs(dcus);
  return getDCUs();
}

export function updateDCU(id: string, updates: Partial<Pick<DCU, "name" | "site" | "active">>) {
  requireAdmin();
  const dcus = read<DCU[]>(DCUS_KEY, []);
  const existing = getDCUs().find((dcu) => dcu.id === id);
  if (!existing) throw new Error("DCU location not found");
  const index = dcus.findIndex((dcu) => dcu.id === id);
  const next = { ...existing, ...updates };
  if (index === -1) dcus.push(next); else dcus[index] = next;
  saveDCUs(dcus); return getDCUs();
}

/* ── Users / local access control ── */
export function getUsers(): AppUser[] { requireAdmin(); return read<AppUser[]>(USERS_KEY, []); }
export function hasUsers(): boolean { return readUsers().length > 0; }
function readUsers(): AppUser[] { return read<AppUser[]>(USERS_KEY, []); }
export function getCurrentUser(): AppUser | null {
  const id = read<string | null>(CURRENT_USER_KEY, null);
  return id ? readUsers().find((user) => user.id === id) ?? null : null;
}
export function addUser(user: AppUser): AppUser[] {
  const existing = readUsers();
  if (existing.length) requireAdmin();
  const users = existing;
  if (users.some((item) => item.name.toLocaleLowerCase() === user.name.toLocaleLowerCase())) throw new Error("That user name is already in use");
  if (user.assignedDcuId && users.some((item) => item.enabled !== false && item.assignedDcuId === user.assignedDcuId)) throw new Error("That DCU location is already assigned to another enabled user");
  const next = [...users, { ...user, enabled: user.enabled ?? true }]; write(USERS_KEY, next); return next;
}
export function deleteUser(id: string): AppUser[] {
  requireAdmin();
  const next = readUsers().filter((user) => user.id !== id); write(USERS_KEY, next);
  if (read<string | null>(CURRENT_USER_KEY, null) === id) write(CURRENT_USER_KEY, null);
  return next;
}
export function updateUser(id: string, updates: Partial<Pick<AppUser, "password" | "role" | "assignedDcuId" | "enabled">>): AppUser[] {
  requireAdmin();
  const users = readUsers();
  const next = users.map((user) => user.id === id ? { ...user, ...updates } : user);
  const assignments = next.filter((user) => user.enabled !== false && user.assignedDcuId).map((user) => user.assignedDcuId);
  if (new Set(assignments).size !== assignments.length) throw new Error("Each active DCU location can be assigned to only one user");
  write(USERS_KEY, next); return next;
}
export function login(name: string, password: string, role: UserRole): AppUser | null {
  const user = readUsers().find((item) => item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase() && item.password === password && item.role === role && item.enabled !== false);
  if (user) write(CURRENT_USER_KEY, user.id); return user ?? null;
}
export function logout() { write(CURRENT_USER_KEY, null); }

/* ── Settings ── */

export function getDefaultSettings(): AppSettings {
  return {
    soundEnabled: true,
    autoScan: false,
    autoScanDelayMs: 1500,
    metersPerCarton: 12,
    cartonsPerBatch: 15,
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
  requireAdmin();
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
  bulkCarton = false,
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
    ...(bulkCarton ? { bulkCarton: true } : {}),
  };
}

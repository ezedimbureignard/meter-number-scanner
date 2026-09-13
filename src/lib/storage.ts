import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { normalizeSerial } from "./serial";
import type { MeterScan, DCU, AppSettings, ScanSession, CartonManifest, AppUser, UserRole } from "./types";

const SESSIONS_KEY = "metertrack_sessions";
const MANIFESTS_KEY = "metertrack_manifests";

export const MASTER_DCU_SITES = ["Wuese", "Lobi", "Utonkon", "Uduo", "Orakamu", "Adabu", "Udeni", "Assakio", "Ajio Shangev-Ya", "Azara Maisamri", "Saminaka", "Betse"];

/* ── Local-only helpers (sessions + manifests stay on the device) ── */

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

/* ── Cloud-backed cache ──
   Reads are served synchronously from this in-memory mirror of the database so
   the UI stays simple; every write goes to the cloud and rolls back on failure.
   Row-level security in the database is the real permission boundary. */

interface Cache {
  scans: MeterScan[];
  dcus: DCU[];
  users: AppUser[];
  settings: AppSettings | null;
  currentUser: AppUser | null;
  loaded: boolean;
}

const cache: Cache = { scans: [], dcus: [], users: [], settings: null, currentUser: null, loaded: false };

const listeners = new Set<() => void>();

export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function isStoreLoaded() {
  return cache.loaded;
}

function toScan(row: {
  id: string;
  meter_serial: string;
  dcu_id: string;
  box_id: string;
  scan_date_time: string;
  status: string;
  notes: string | null;
  session_id: string | null;
  bulk_carton: boolean;
  sheets_exported_at: string | null;
}): MeterScan {
  return {
    id: row.id,
    meterSerial: row.meter_serial,
    dcuId: row.dcu_id,
    boxId: row.box_id,
    scanDateTime: row.scan_date_time,
    status: (row.status as MeterScan["status"]) ?? "assigned",
    notes: row.notes ?? "",
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    ...(row.bulk_carton ? { bulkCarton: true } : {}),
    ...(row.sheets_exported_at ? { sheetsExportedAt: row.sheets_exported_at } : {}),
  };
}

export async function loadStore(): Promise<AppUser | null> {
  const { data: auth } = await supabase.auth.getUser();
  const authUser = auth.user;
  if (!authUser) {
    cache.scans = [];
    cache.dcus = [];
    cache.users = [];
    cache.settings = null;
    cache.currentUser = null;
    cache.loaded = true;
    notify();
    return null;
  }

  const [profiles, roles, dcus, scans, settings] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("dcus").select("*").order("name"),
    supabase.from("scans").select("*").order("scan_date_time", { ascending: false }),
    supabase.from("app_settings").select("data").eq("id", 1).maybeSingle(),
  ]);

  const loadError = [profiles.error, roles.error, dcus.error, scans.error, settings.error].find(Boolean);
  if (loadError) {
    cache.loaded = true;
    notify();
    throw new Error(`Unable to load cloud data: ${loadError.message}`);
  }

  const roleFor = (id: string): UserRole =>
    (roles.data ?? []).some((row) => row.user_id === id && row.role === "admin") ? "admin" : "standard";

  cache.users = (profiles.data ?? []).map((row) => ({
    id: row.id,
    name: row.username,
    password: "",
    role: roleFor(row.id),
    ...(row.assigned_dcu_id ? { assignedDcuId: row.assigned_dcu_id } : {}),
    enabled: row.enabled,
    createdAt: row.created_at,
  }));
  cache.currentUser = cache.users.find((user) => user.id === authUser.id) ?? null;
  cache.dcus = (dcus.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    ...(row.site ? { site: row.site } : {}),
    active: row.active,
  }));
  cache.scans = (scans.data ?? []).map(toScan);
  cache.settings = { ...getDefaultSettings(), ...((settings.data?.data as Partial<AppSettings> | undefined) ?? {}) };
  cache.loaded = true;
  notify();
  return cache.currentUser;
}

function failed(message: string, cause: unknown) {
  toast.error(message, { description: cause instanceof Error ? cause.message : undefined });
  void loadStore();
}

/* ── Authentication ── */

export function usernameToEmail(username: string) {
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${normalized || "user"}@metertrack.local`;
}

export async function createFirstAccount(username: string, password: string): Promise<AppUser> {
  const { createInitialAccount } = await import("./bootstrap.functions");
  await createInitialAccount({ data: { username, password } });
  return signIn(username, password);
}

export async function signIn(username: string, password: string): Promise<AppUser> {
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error) throw new Error("Incorrect username or password.");
  const user = await loadStore();
  if (!user) throw new Error("No profile is set up for this account.");
  if (user.enabled === false) {
    await supabase.auth.signOut();
    throw new Error("This user account is disabled.");
  }
  return user;
}

export async function signOutUser() {
  await supabase.auth.signOut();
  cache.scans = [];
  cache.users = [];
  cache.currentUser = null;
  notify();
}

/* ── Scans ── */

export function getScans(): MeterScan[] {
  return cache.scans;
}

function requireAdmin() {
  if (cache.currentUser?.role !== "admin") throw new Error("Administrator permission required");
}

function requireLocationAccess(dcuId: string) {
  const user = cache.currentUser;
  if (!user) throw new Error("Sign in is required");
  if (user.enabled === false) throw new Error("This user account is disabled");
  if (user.role === "standard" && user.assignedDcuId !== dcuId) throw new Error("You are not assigned to this DCU location");
}

export function saveScans(scans: MeterScan[]) {
  cache.scans = scans;
  notify();
}

export function addScan(scan: MeterScan): MeterScan[] {
  requireLocationAccess(scan.dcuId);
  const settings = getSettings();
  const cartonCount = cache.scans.filter((item) => item.dcuId === scan.dcuId && item.boxId === scan.boxId).length;
  if (cartonCount >= settings.metersPerCarton) throw new Error(`The scan limit of ${settings.metersPerCarton} has been reached for this carton`);
  if (cache.scans.some((item) => normalizeSerial(item.meterSerial) === normalizeSerial(scan.meterSerial))) {
    throw new Error("That meter number has already been recorded");
  }
  cache.scans = [scan, ...cache.scans];
  notify();
  void persistScan(scan);
  return cache.scans;
}

async function persistScan(scan: MeterScan) {
  const userId = cache.currentUser?.id;
  const { error } = await supabase.from("scans").insert({
    id: scan.id,
    meter_serial: scan.meterSerial,
    normalized_serial: normalizeSerial(scan.meterSerial),
    dcu_id: scan.dcuId,
    box_id: scan.boxId,
    scan_date_time: scan.scanDateTime,
    status: scan.status,
    notes: scan.notes ?? "",
    ...(scan.sessionId ? { session_id: scan.sessionId } : {}),
    bulk_carton: scan.bulkCarton ?? false,
    ...(userId ? { created_by: userId } : {}),
  });
  if (error) failed("That scan could not be saved", error);
}

export function addScans(newScans: MeterScan[]): MeterScan[] {
  for (const scan of newScans) addScan(scan);
  return cache.scans;
}

export function updateScan(id: string, updates: Partial<MeterScan>): MeterScan[] {
  requireAdmin();
  cache.scans = cache.scans.map((scan) => (scan.id === id ? ({ ...scan, ...updates } as MeterScan) : scan));
  notify();
  const next = cache.scans.find((scan) => scan.id === id);
  if (next) {
    void supabase
      .from("scans")
      .update({
        meter_serial: next.meterSerial,
        normalized_serial: normalizeSerial(next.meterSerial),
        dcu_id: next.dcuId,
        box_id: next.boxId,
        status: next.status,
        notes: next.notes ?? "",
      })
      .eq("id", id)
      .then(({ error }) => {
        if (error) failed("That change could not be saved", error);
      });
  }
  return cache.scans;
}

export function deleteScan(id: string): MeterScan[] {
  requireAdmin();
  cache.scans = cache.scans.filter((scan) => scan.id !== id);
  notify();
  void supabase
    .from("scans")
    .delete()
    .eq("id", id)
    .then(({ error }) => {
      if (error) failed("That scan could not be deleted", error);
    });
  return cache.scans;
}

export function markScansExported(ids: string): MeterScan[];
export function markScansExported(ids: string[]): MeterScan[];
export function markScansExported(ids: string | string[]): MeterScan[] {
  const idList = Array.isArray(ids) ? ids : [ids];
  const idSet = new Set(idList);
  const exportedAt = new Date().toISOString();
  cache.scans = cache.scans.map((scan) => (idSet.has(scan.id) ? { ...scan, sheetsExportedAt: exportedAt } : scan));
  notify();
  void supabase
    .from("scans")
    .update({ sheets_exported_at: exportedAt })
    .in("id", idList)
    .then(({ error }) => {
      if (error) failed("The export could not be recorded", error);
    });
  return cache.scans;
}

export function deleteScansByBox(boxId: string): MeterScan[] {
  requireAdmin();
  cache.scans = cache.scans.filter((scan) => scan.boxId !== boxId);
  notify();
  void supabase
    .from("scans")
    .delete()
    .eq("box_id", boxId)
    .then(({ error }) => {
      if (error) failed("That carton could not be deleted", error);
    });
  return cache.scans;
}

export function clearAllScans() {
  requireAdmin();
  const ids = cache.scans.map((scan) => scan.id);
  cache.scans = [];
  notify();
  if (ids.length) {
    void supabase
      .from("scans")
      .delete()
      .in("id", ids)
      .then(({ error }) => {
        if (error) failed("The scans could not be cleared", error);
      });
  }
}

/* ── Sessions (device-local) ── */

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
  const sessions = getSessions().map((session) => (session.id === id ? { ...session, ...updates } : session));
  saveSessions(sessions);
  return sessions;
}

/* ── Carton manifests (device-local) ── */

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
  return cache.dcus;
}

export function saveDCUs(dcus: DCU[]) {
  cache.dcus = dcus;
  notify();
}

export function addDCU(dcu: DCU) {
  requireAdmin();
  if (cache.dcus.some((item) => item.id === dcu.id)) return cache.dcus;
  cache.dcus = [...cache.dcus, { ...dcu, active: dcu.active ?? true }];
  notify();
  void supabase
    .from("dcus")
    .insert({ id: dcu.id, name: dcu.name, site: dcu.site ?? dcu.name, active: true })
    .then(({ error }) => {
      if (error) failed("That location could not be added", error);
    });
  return cache.dcus;
}

export function removeDCU(id: string) {
  return updateDCU(id, { active: false });
}

export function updateDCU(id: string, updates: Partial<Pick<DCU, "name" | "site" | "active">>) {
  requireAdmin();
  const existing = cache.dcus.find((dcu) => dcu.id === id);
  if (!existing) throw new Error("DCU location not found");
  const next: DCU = { ...existing, ...updates };
  cache.dcus = cache.dcus.map((dcu) => (dcu.id === id ? next : dcu));
  notify();
  void supabase
    .from("dcus")
    .update({ name: next.name, site: next.site ?? next.name, active: next.active ?? true })
    .eq("id", id)
    .then(({ error }) => {
      if (error) failed("That location could not be updated", error);
    });
  return cache.dcus;
}

/* ── Users ── */

export function getUsers(): AppUser[] {
  return cache.users;
}

export function hasUsers(): boolean {
  return cache.users.length > 0;
}

export function getCurrentUser(): AppUser | null {
  return cache.currentUser;
}

export async function addUser(input: { name: string; password: string; role: UserRole; assignedDcuId?: string }): Promise<AppUser[]> {
  requireAdmin();
  const { createUserAccount } = await import("./admin.functions");
  await createUserAccount({
    data: {
      username: input.name.trim(),
      password: input.password,
      role: input.role,
      assignedDcuId: input.role === "standard" ? (input.assignedDcuId ?? null) : null,
    },
  });
  await loadStore();
  return cache.users;
}

export async function deleteUser(id: string): Promise<AppUser[]> {
  requireAdmin();
  const { deleteUserAccount } = await import("./admin.functions");
  await deleteUserAccount({ data: { userId: id } });
  await loadStore();
  return cache.users;
}

export async function updateUser(
  id: string,
  updates: { password?: string; role?: UserRole; assignedDcuId?: string | null; enabled?: boolean },
): Promise<AppUser[]> {
  requireAdmin();
  const { updateUserAccount } = await import("./admin.functions");
  await updateUserAccount({
    data: {
      userId: id,
      ...(updates.password !== undefined ? { password: updates.password } : {}),
      ...(updates.role !== undefined ? { role: updates.role } : {}),
      ...(updates.assignedDcuId !== undefined ? { assignedDcuId: updates.assignedDcuId } : {}),
      ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
    },
  });
  await loadStore();
  return cache.users;
}

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
  return cache.settings ?? getDefaultSettings();
}

export function saveSettings(settings: AppSettings) {
  requireAdmin();
  cache.settings = settings;
  notify();
  void supabase
    .from("app_settings")
    .upsert({ id: 1, data: settings as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) failed("Settings could not be saved", error);
    });
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

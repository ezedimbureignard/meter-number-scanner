import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useHydrated } from "@/lib/use-hydrated";
import {
  getDCUs,
  addDCU,
  removeDCU,
  getSettings,
  saveSettings,
  clearAllScans,
  getScans,
  getUsers,
  addUser,
  deleteUser,
  getCurrentUser,
  updateUser,
  updateDCU,
  subscribeStore,
} from "@/lib/storage";
import type { DCU, AppSettings, AppUser, UserRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Trash2,
  Volume2,
  Smartphone,
  Zap,
  Link2,
  Database,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MeterTrack" },
      {
        name: "description",
        content:
          "Configure DCUs, columns, scan settings, and Google Sheets sync.",
      },
      { property: "og:title", content: "Settings — MeterTrack" },
      {
        property: "og:description",
        content:
          "Configure DCUs, columns, scan settings, and Google Sheets sync.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const hydrated = useHydrated();
  const [dcus, setDcus] = useState<DCU[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [newDcuId, setNewDcuId] = useState("");
  const [newDcuName, setNewDcuName] = useState("");
  const [scanCount, setScanCount] = useState(0);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("standard");
  const [newUserDcu, setNewUserDcu] = useState("");
  const [passwordResetFor, setPasswordResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [editDcuId, setEditDcuId] = useState<string | null>(null);
  const [editDcuName, setEditDcuName] = useState("");
  const currentUser = getCurrentUser();

  useEffect(() => {
    const refresh = () => {
      setDcus(getDCUs());
      setSettings(getSettings());
      setScanCount(getScans().length);
      setUsers(getUsers());
    };
    if (hydrated) refresh();
    return subscribeStore(refresh);
  }, [hydrated]);

  const handleAddDcu = () => {
    if (!newDcuId.trim() || !newDcuName.trim()) {
      toast.error("Enter both DCU ID and name");
      return;
    }
    const updated = addDCU({ id: newDcuId.trim(), name: newDcuName.trim() });
    setDcus(updated);
    setNewDcuId("");
    setNewDcuName("");
    toast.success("DCU added");
  };

  const handleAddUser = async () => {
    if (!newUserName.trim() || !newUserPassword) return toast.error("Enter a user name and password");
    if (newUserRole === "standard" && !newUserDcu) return toast.error("Assign a DCU location to each standard user");
    try {
      setUsers(await addUser({ name: newUserName.trim(), password: newUserPassword, role: newUserRole, assignedDcuId: newUserRole === "standard" ? newUserDcu : undefined }));
      setNewUserName(""); setNewUserPassword(""); setNewUserDcu(""); setNewUserRole("standard"); toast.success("User added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add user"); }
  };

  const handleRemoveDcu = (id: string) => {
    setDcus(removeDCU(id));
    toast.success("DCU removed");
  };

  const handleUpdateUser = async (id: string, updates: Parameters<typeof updateUser>[1], successMessage: string) => {
    try {
      setUsers(await updateUser(id, updates));
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update user");
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      setUsers(await deleteUser(id));
      toast.success("User deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete user");
    }
  };

  const updateSettings = (updates: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...updates };
    setSettings(next);
    saveSettings(next);
  };

  const updateColumn = (
    key: keyof AppSettings["columnConfig"],
    value: string,
  ) => {
    if (!settings) return;
    const next = {
      ...settings,
      columnConfig: { ...settings.columnConfig, [key]: value },
    };
    setSettings(next);
    saveSettings(next);
  };

  const handleClearAll = () => {
    clearAllScans();
    setScanCount(0);
    toast.success("All scans cleared");
  };

  if (!hydrated || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (currentUser?.role !== "admin") return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Administrator access required.</div>;

  return (
    <div className="min-h-screen pb-24">
      <header className="border-b border-border bg-card/50 px-4 py-3">
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
      </header>

      <div className="space-y-4 px-4 py-4">
        <Card>
          <CardHeader><CardTitle className="text-base">User access</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2"><Input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="User name" /><Input type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="Password" /></div>
            <div className="grid grid-cols-2 gap-2"><select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as UserRole)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="standard">Standard user</option><option value="admin">Administrator</option></select><select value={newUserDcu} onChange={(e) => setNewUserDcu(e.target.value)} disabled={newUserRole === "admin"} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Assign DCU location</option>{dcus.filter((dcu) => !users.some((user) => user.assignedDcuId === dcu.id)).map((dcu) => <option key={dcu.id} value={dcu.id}>{dcu.name}</option>)}</select></div>
            <Button className="w-full" onClick={() => void handleAddUser()}>Add user</Button>
            <p className="text-xs text-muted-foreground">A DCU location can be assigned to only one enabled standard user.</p>
            {users.map((user) => <div key={user.id} className="space-y-2 rounded-lg border border-border p-2.5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">{user.name} <span className="text-muted-foreground">· {user.role} · {user.enabled === false ? "disabled" : "enabled"}</span></p><p className="text-xs text-muted-foreground">{dcus.find((dcu) => dcu.id === user.assignedDcuId)?.name ?? (user.role === "admin" ? "All locations" : "No location")}</p></div>{user.id !== currentUser.id && <button onClick={() => void handleDeleteUser(user.id)} className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${user.name}`}><Trash2 className="h-4 w-4" /></button>}</div>{user.id !== currentUser.id && <div className="flex flex-wrap gap-2"><select value={user.role} onChange={(e) => { const role = e.target.value as UserRole; void handleUpdateUser(user.id, { role, assignedDcuId: role === "admin" ? null : user.assignedDcuId }, "Role updated"); }} className="h-8 rounded border border-input bg-background px-2 text-xs"><option value="standard">Standard</option><option value="admin">Admin</option></select><select value={user.assignedDcuId ?? ""} disabled={user.role === "admin"} onChange={(e) => void handleUpdateUser(user.id, { assignedDcuId: e.target.value || null }, "Assignment updated")} className="h-8 rounded border border-input bg-background px-2 text-xs"><option value="">No location</option>{dcus.filter((dcu) => dcu.active !== false && (dcu.id === user.assignedDcuId || !users.some((item) => item.id !== user.id && item.enabled !== false && item.assignedDcuId === dcu.id))).map((dcu) => <option key={dcu.id} value={dcu.id}>{dcu.name}</option>)}</select><Button size="sm" variant="outline" onClick={() => void handleUpdateUser(user.id, { enabled: user.enabled === false }, user.enabled === false ? "User enabled" : "User disabled")}>{user.enabled === false ? "Enable" : "Disable"}</Button><Button size="sm" variant="outline" onClick={() => { setPasswordResetFor(user.id); setResetPassword(""); }}>Reset password</Button></div>}{passwordResetFor === user.id && <div className="flex gap-2"><Input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="New password" /><Button size="sm" onClick={() => { if (!resetPassword) return toast.error("Enter a new password"); void handleUpdateUser(user.id, { password: resetPassword }, "Password reset"); setPasswordResetFor(null); }}>Save</Button></div>}</div>)}
          </CardContent>
        </Card>
        {/* DCU Management */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">DCU Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newDcuId}
                onChange={(e) => setNewDcuId(e.target.value)}
                placeholder="DCU ID (e.g. DCU-01)"
                className="font-mono"
              />
              <Input
                value={newDcuName}
                onChange={(e) => setNewDcuName(e.target.value)}
                placeholder="Name (e.g. Substation A)"
              />
              <Button onClick={handleAddDcu} size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {dcus.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No DCUs yet. Add one above to use in scans.
              </p>
            ) : (
              <div className="space-y-1.5">
                {dcus.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border border-border p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-medium">{d.id}</p>
                      {editDcuId === d.id ? <div className="mt-1 flex gap-1"><Input value={editDcuName} onChange={(e) => setEditDcuName(e.target.value)} className="h-7 text-xs" /><Button size="sm" onClick={() => { if (!editDcuName.trim()) return; setDcus(updateDCU(d.id, { name: editDcuName.trim() })); setEditDcuId(null); toast.success("DCU updated"); }}>Save</Button></div> : <p className="text-xs text-muted-foreground">{d.name} {d.active === false ? "· inactive" : ""}</p>}
                    </div>
                    <button onClick={() => { setEditDcuId(d.id); setEditDcuName(d.name); }} className="mr-2 text-xs text-muted-foreground hover:text-primary">Edit</button>
                    <button
                      onClick={() => { if (d.active === false) { setDcus(updateDCU(d.id, { active: true })); toast.success("DCU activated"); } else handleRemoveDcu(d.id); }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <span className="text-xs">{d.active === false ? "Enable" : "Disable"}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column Names */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Column Names</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              Object.keys(settings.columnConfig) as (keyof AppSettings["columnConfig"])[]
            ).map((key) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs capitalize text-muted-foreground">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </Label>
                <Input
                  value={settings.columnConfig[key]}
                  onChange={(e) => updateColumn(key, e.target.value)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Scan Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scan Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <Label>Sound on scan</Label>
              </div>
              <Switch
                checked={settings.soundEnabled}
                onCheckedChange={(v) => updateSettings({ soundEnabled: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <Label>Vibrate on scan</Label>
              </div>
              <Switch
                checked={settings.vibrateOnScan}
                onCheckedChange={(v) => updateSettings({ vibrateOnScan: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <Label>Auto-scan (auto-save on detect)</Label>
              </div>
              <Switch
                checked={settings.autoScan}
                onCheckedChange={(v) => updateSettings({ autoScan: v })}
              />
            </div>
            <div className="space-y-1.5 rounded-lg bg-secondary p-3">
              <Label htmlFor="auto-scan-delay">Time between auto-scans (seconds)</Label>
              <Input
                id="auto-scan-delay"
                type="number"
                min="0.5"
                max="10"
                step="0.5"
                value={settings.autoScanDelayMs / 1000}
                onChange={(event) => {
                  const seconds = Number(event.target.value);
                  if (Number.isFinite(seconds)) {
                    updateSettings({
                      autoScanDelayMs: Math.round(
                        Math.min(10, Math.max(0.5, seconds)) * 1000,
                      ),
                    });
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Camera scans are paused briefly after each accepted meter. Default: 1.5 seconds.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-secondary p-3"><div className="space-y-1"><Label>Meters per carton</Label><Input type="number" min="1" value={settings.metersPerCarton} onChange={(e) => updateSettings({ metersPerCarton: Math.max(1, Number(e.target.value) || 1) })} /></div><div className="space-y-1"><Label>Cartons per batch</Label><Input type="number" min="1" value={settings.cartonsPerBatch} onChange={(e) => updateSettings({ cartonsPerBatch: Math.max(1, Number(e.target.value) || 1) })} /></div><p className="col-span-2 text-xs text-muted-foreground">These limits control bulk scanning and the batch export threshold.</p></div>
          </CardContent>
        </Card>

        {/* Google Sheets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" /> Google Sheets Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Spreadsheet ID</Label>
              <Input
                value={settings.spreadsheetId}
                onChange={(e) =>
                  updateSettings({ spreadsheetId: e.target.value })
                }
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>Sheet Name</Label>
              <Input
                value={settings.sheetName}
                onChange={(e) => updateSettings({ sheetName: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use the Inventory page's Sync button to push scans to this sheet.
              The connector must be linked in Lovable's connector settings.
            </p>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" /> Data Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
              <span className="text-sm">Total scans stored</span>
              <span className="font-mono font-bold text-primary">
                {scanCount}
              </span>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="mr-2 h-4 w-4" /> Clear All Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all scan data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes all {scanCount} scan records from
                    this device. Export to Excel first if you need a backup.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearAll}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

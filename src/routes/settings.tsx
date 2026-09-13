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
} from "@/lib/storage";
import type { DCU, AppSettings } from "@/lib/types";
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

  useEffect(() => {
    if (hydrated) {
      setDcus(getDCUs());
      setSettings(getSettings());
      setScanCount(getScans().length);
    }
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

  const handleRemoveDcu = (id: string) => {
    setDcus(removeDCU(id));
    toast.success("DCU removed");
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

  return (
    <div className="min-h-screen pb-24">
      <header className="border-b border-border bg-card/50 px-4 py-3">
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
      </header>

      <div className="space-y-4 px-4 py-4">
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
                    <div>
                      <p className="font-mono text-sm font-medium">{d.id}</p>
                      <p className="text-xs text-muted-foreground">{d.name}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveDcu(d.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
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

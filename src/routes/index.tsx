import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHydrated } from "@/lib/use-hydrated";
import {
  getScans,
  getDCUs,
  getSettings,
  addScan,
  addDCU,
  createScan,
} from "@/lib/storage";
import { fetchSheetData } from "@/lib/sheets.functions";
import { normalizeSerial, extractSerial } from "@/lib/serial";
import { STATUS_LABELS } from "@/lib/types";
import type { MeterScan, DCU, AppSettings, ScanStatus } from "@/lib/types";
import {
  Boxes,
  CheckCircle2,
  Plus,
  AlertTriangle,
  RefreshCw,
  CloudOff,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Scan Meters — MeterTrack" },
      {
        name: "description",
        content:
          "Scan meter barcodes, assign them to DCUs and cartons, and sync to your spreadsheet.",
      },
      { property: "og:title", content: "Scan Meters — MeterTrack" },
      {
        property: "og:description",
        content:
          "Scan meter barcodes, assign them to DCUs and cartons, and sync to your spreadsheet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const hydrated = useHydrated();
  const loadSheet = useServerFn(fetchSheetData);

  const [scannedSerial, setScannedSerial] = useState("");
  const [dcuId, setDcuId] = useState("");
  const [boxId, setBoxId] = useState("");
  const [status, setStatus] = useState<ScanStatus>("assigned");
  const [recentScans, setRecentScans] = useState<MeterScan[]>([]);
  const [dcus, setDcus] = useState<DCU[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [bulkBoxId, setBulkBoxId] = useState("");
  const [bulkDcuId, setBulkDcuId] = useState("");
  const [bulkCount, setBulkCount] = useState(0);
  const [totalScans, setTotalScans] = useState(0);
  const [totalBoxes, setTotalBoxes] = useState(0);

  // Google Sheet state
  const [sheetSerials, setSheetSerials] = useState<Set<string>>(new Set());
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Dialogs
  const [duplicate, setDuplicate] = useState<{
    serial: string;
    where: string;
  } | null>(null);
  const [addDcuOpen, setAddDcuOpen] = useState(false);
  const [newDcuName, setNewDcuName] = useState("");

  const lastScanTime = useRef(0);

  const localSerials = useMemo(
    () => new Set(getScansSafe().map((s) => normalizeSerial(s.meterSerial))),
    [totalScans, hydrated],
  );

  function getScansSafe(): MeterScan[] {
    if (typeof window === "undefined") return [];
    return getScans();
  }

  const refreshRecent = () => {
    const scans = getScans();
    setRecentScans(scans.slice(0, 5));
    setTotalScans(scans.length);
    setTotalBoxes(new Set(scans.map((s) => s.boxId)).size);
  };

  const syncDcusFromSheet = useCallback(
    async (s: AppSettings, silent = true) => {
      setSheetLoading(true);
      setSheetError(null);
      try {
        const result = await loadSheet({
          data: { spreadsheetId: s.spreadsheetId, sheetName: s.sheetName },
        });
        setSheetSerials(new Set(result.serials.map(normalizeSerial)));

        // Merge the sheet's DCU locations into the local list
        const existing = getDCUs();
        for (const name of result.dcus) {
          if (!existing.some((d) => d.id === name)) {
            addDCU({ id: name, name });
          }
        }
        setDcus(getDCUs());

        // Suggest the next carton number
        if (result.lastCarton > 0) {
          const next = String(result.lastCarton + 1);
          setBoxId((b) => b || next);
          setBulkBoxId((b) => b || next);
        }

        if (!silent) {
          toast.success("Synced from spreadsheet", {
            description: `${result.dcus.length} DCUs · ${result.serials.length} meters on file`,
          });
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not reach the spreadsheet";
        setSheetError(msg);
        if (!silent) toast.error("Sync failed", { description: msg });
      } finally {
        setSheetLoading(false);
      }
    },
    [loadSheet],
  );

  useEffect(() => {
    if (!hydrated) return;
    refreshRecent();
    setDcus(getDCUs());
    const s = getSettings();
    setSettings(s);
    void syncDcusFromSheet(s, true);
  }, [hydrated, syncDcusFromSheet]);

  /** Returns true when the serial is new, false (and opens the dialog) when duplicated. */
  const checkDuplicate = useCallback(
    (serial: string): boolean => {
      const norm = normalizeSerial(serial);
      if (sheetSerials.has(norm)) {
        setDuplicate({ serial, where: "the spreadsheet" });
        return false;
      }
      if (localSerials.has(norm)) {
        setDuplicate({ serial, where: "this device's scan list" });
        return false;
      }
      return true;
    },
    [sheetSerials, localSerials],
  );

  const handleScan = useCallback(
    (raw: string) => {
      const now = Date.now();
      if (now - lastScanTime.current < 400) return;
      lastScanTime.current = now;

      const text = extractSerial(raw);

      if (mode === "bulk" && bulkBoxId && bulkDcuId) {
        const scan = createScan(text, bulkDcuId, bulkBoxId);
        addScan(scan);
        const newCount = bulkCount + 1;
        setBulkCount(newCount);
        refreshRecent();
        if (newCount >= 12) {
          toast.success("Carton complete!", {
            description: "12/12 meters scanned for this box.",
          });
          setBulkCount(0);
          setBulkBoxId(String(Number(bulkBoxId) + 1 || ""));
        } else {
          toast.success(`Scanned ${newCount}/12`, { description: text });
        }
      } else {
        setScannedSerial(text);
        toast.success("Barcode detected", { description: text });
        if (settings?.autoScan && dcuId && boxId) {
          const scan = createScan(text, dcuId, boxId, status);
          addScan(scan);
          refreshRecent();
          toast.success("Auto-saved", { description: text });
          setScannedSerial("");
        }
      }
    },
    [mode, bulkBoxId, bulkDcuId, bulkCount, settings, dcuId, boxId, status],
  );

  const handleSave = () => {
    const serial = extractSerial(scannedSerial);
    if (!serial.trim()) {
      toast.error("Scan or enter a meter serial");
      return;
    }
    if (!dcuId) {
      toast.error("Select a DCU");
      return;
    }
    if (!boxId.trim()) {
      toast.error("Enter a carton number");
      return;
    }
    if (!checkDuplicate(serial)) return;
    addScan(createScan(serial, dcuId, boxId.trim(), status));
    refreshRecent();
    toast.success("Scan saved", { description: serial });
    setScannedSerial("");
  };

  const handleAddDcu = () => {
    const name = newDcuName.trim();
    if (!name) return;
    addDCU({ id: name, name });
    setDcus(getDCUs());
    if (mode === "bulk") setBulkDcuId(name);
    else setDcuId(name);
    setNewDcuName("");
    setAddDcuOpen(false);
    toast.success("DCU added", { description: name });
  };

  if (!hydrated || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const dcuSelect = (value: string, onChange: (v: string) => void) => (
    <div className="flex gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="flex-1">
          <SelectValue
            placeholder={dcus.length ? "Select DCU" : "No DCUs yet"}
          />
        </SelectTrigger>
        <SelectContent>
          {dcus.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Tap + to add one
            </div>
          ) : (
            dcus.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        aria-label="Add DCU"
        onClick={() => setAddDcuOpen(true)}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen pb-24">
      <header className="border-b border-border bg-card/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">MeterTrack</h1>
            <p className="text-xs text-muted-foreground">
              {totalScans} on device · {sheetSerials.size} in sheet
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Boxes className="h-3 w-3" />
              {totalBoxes}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh from spreadsheet"
              onClick={() => void syncDcusFromSheet(settings, false)}
              disabled={sheetLoading}
            >
              {sheetError ? (
                <CloudOff className="h-4 w-4 text-destructive" />
              ) : (
                <RefreshCw
                  className={`h-4 w-4 ${sheetLoading ? "animate-spin" : ""}`}
                />
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "bulk")}>
          <TabsList className="w-full">
            <TabsTrigger value="single" className="flex-1">
              Single Scan
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex-1">
              Bulk (12/carton)
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <BarcodeScanner
          onScan={handleScan}
          soundEnabled={settings.soundEnabled}
          vibrateOnScan={settings.vibrateOnScan}
          validate={(text) => checkDuplicate(extractSerial(text))}
        />

        {mode === "single" && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="space-y-1.5">
              <Label>Meter Serial</Label>
              <Input
                value={scannedSerial}
                onChange={(e) => setScannedSerial(e.target.value)}
                placeholder="Scan or type serial…"
                className="font-mono"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label>DCU Location</Label>
              {dcuSelect(dcuId, setDcuId)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Carton No.</Label>
                <Input
                  value={boxId}
                  onChange={(e) => setBoxId(e.target.value)}
                  placeholder="e.g. 42"
                  className="font-mono"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as ScanStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full" size="lg">
              <Plus className="mr-2 h-4 w-4" /> Save Scan
            </Button>
          </div>
        )}

        {mode === "bulk" && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="space-y-1.5">
              <Label>DCU Location</Label>
              {dcuSelect(bulkDcuId, setBulkDcuId)}
            </div>
            <div className="space-y-1.5">
              <Label>Carton No.</Label>
              <Input
                value={bulkBoxId}
                onChange={(e) => setBulkBoxId(e.target.value)}
                placeholder="e.g. 42"
                className="font-mono"
                inputMode="numeric"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
              <span className="text-sm font-medium">Meters in carton</span>
              <span className="font-mono text-2xl font-bold text-primary">
                {bulkCount}
                <span className="text-muted-foreground">/12</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(bulkCount / 12) * 100}%` }}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {bulkBoxId && bulkDcuId
                ? "Scan each meter — they auto-save to this carton"
                : "Set DCU and carton number first, then start scanning"}
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setBulkCount(0);
                toast.info("Counter reset");
              }}
            >
              Reset Counter
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent Scans
          </h2>
          {recentScans.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No scans yet. Start scanning to begin.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentScans.map((scan) => (
                <div
                  key={scan.id}
                  className="slide-in flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-medium">
                      {scan.meterSerial}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {scan.dcuId} · Carton {scan.boxId}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {STATUS_LABELS[scan.status]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Duplicate warning */}
      <Dialog open={!!duplicate} onOpenChange={(o) => !o && setDuplicate(null)}>
        <DialogContent className="max-w-sm border-destructive/50">
          <DialogHeader>
            <div className="mb-2 flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="text-destructive">
                Duplicate meter
              </DialogTitle>
            </div>
            <DialogDescription className="text-left">
              <span className="mb-2 block font-mono text-base font-semibold text-foreground">
                {duplicate?.serial}
              </span>
              is a duplicate value and already exists in {duplicate?.where}. It
              was not saved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              className="w-full"
              variant="destructive"
              onClick={() => setDuplicate(null)}
            >
              OK, continue scanning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add DCU */}
      <Dialog open={addDcuOpen} onOpenChange={setAddDcuOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add DCU location</DialogTitle>
            <DialogDescription>
              New DCUs appear in the dropdown and are written to your sheet on
              sync.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newDcuName}
            onChange={(e) => setNewDcuName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddDcu()}
            placeholder="e.g. Saminaka DCU 6"
            autoFocus
          />
          <DialogFooter>
            <Button className="w-full" onClick={handleAddDcu}>
              Add DCU
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

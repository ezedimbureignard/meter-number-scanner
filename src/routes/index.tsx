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
  getSessions,
  getManifests,
  markScansExported,
  addScan,
  addDCU,
  createScan,
} from "@/lib/storage";
import { exportCartonsToSheets } from "@/lib/sheets.functions";
import {
  checkSheetsConnection,
  fetchSheetData,
} from "@/lib/sheets.functions";
import { normalizeSerial, extractSerial } from "@/lib/serial";
import { STATUS_LABELS } from "@/lib/types";
import type {
  MeterScan,
  DCU,
  AppSettings,
  CartonManifest,
  ScanSession,
  ScanStatus,
} from "@/lib/types";
import {
  Boxes,
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
  const checkSheetConnection = useServerFn(checkSheetsConnection);

  const [scannedSerial, setScannedSerial] = useState("");
  const [dcuId, setDcuId] = useState("");
  const [boxId, setBoxId] = useState("");
  const [status, setStatus] = useState<ScanStatus>("assigned");
  const [dcus, setDcus] = useState<DCU[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [bulkBoxId, setBulkBoxId] = useState("");
  const [bulkDcuId, setBulkDcuId] = useState("");
  const [bulkCount, setBulkCount] = useState(0);
  const [totalScans, setTotalScans] = useState(0);
  const [totalBoxes, setTotalBoxes] = useState(0);
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [manifests, setManifests] = useState<CartonManifest[]>([]);
  const [exportingCartons, setExportingCartons] = useState(false);
  const [awaitingNextCarton, setAwaitingNextCarton] = useState(false);
  const [nextCartonId, setNextCartonId] = useState("");
  const [reviewCarton, setReviewCarton] = useState<{
    dcuId: string;
    boxId: string;
    scans: MeterScan[];
  } | null>(null);

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

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === settings?.activeSessionId),
    [sessions, settings?.activeSessionId],
  );

  const cartonBlocks = useMemo(() => {
    const grouped = new Map<string, { dcuId: string; boxId: string; scans: MeterScan[] }>();
    for (const scan of getScansSafe()) {
      if (!scan.bulkCarton) continue;
      const key = `${scan.dcuId}\u0000${scan.boxId}`;
      const carton = grouped.get(key) ?? { dcuId: scan.dcuId, boxId: scan.boxId, scans: [] };
      carton.scans.push(scan);
      grouped.set(key, carton);
    }
    return [...grouped.values()].sort((a, b) => b.scans[0]!.scanDateTime.localeCompare(a.scans[0]!.scanDateTime));
  }, [totalScans, hydrated]);

  const completedDcuCartons = useMemo(
    () => cartonBlocks.filter((carton) =>
      carton.dcuId === bulkDcuId &&
      carton.scans.length === 12 &&
      !carton.scans.some((scan) => scan.sheetsExportedAt),
    ),
    [bulkDcuId, cartonBlocks],
  );
  const dcuCartonLimitReached = bulkDcuId !== "" && completedDcuCartons.length >= 15;
  const bulkScannerPaused = mode === "bulk" && (
    !bulkDcuId || !bulkBoxId || awaitingNextCarton || dcuCartonLimitReached
  );

  const activeCarton = useMemo(() => {
    const currentBoxId = mode === "bulk" ? bulkBoxId : boxId;
    const manifest = manifests.find((item) => item.boxId === currentBoxId);
    if (!manifest) return null;

    const scannedSerials = new Set(
      getScansSafe()
        .filter((scan) => scan.boxId === manifest.boxId)
        .map((scan) => normalizeSerial(scan.meterSerial)),
    );
    const expectedSerials = new Set(
      manifest.expectedSerials.map(normalizeSerial),
    );
    const found = [...expectedSerials].filter((serial) => scannedSerials.has(serial)).length;
    const unexpected = [...scannedSerials].filter(
      (serial) => !expectedSerials.has(serial),
    ).length;

    return {
      expected: expectedSerials.size,
      found,
      missing: expectedSerials.size - found,
      unexpected,
    };
  }, [boxId, bulkBoxId, manifests, mode, totalScans]);

  function getScansSafe(): MeterScan[] {
    if (typeof window === "undefined") return [];
    return getScans();
  }

  const refreshRecent = () => {
    const scans = getScans();
    setTotalScans(scans.length);
    setTotalBoxes(new Set(scans.map((s) => s.boxId)).size);
    setSessions(getSessions());
    setManifests(getManifests());
  };

  const syncDcusFromSheet = useCallback(
    async (s: AppSettings, silent = true) => {
      setSheetLoading(true);
      setSheetError(null);
      try {
        const connection = await checkSheetConnection();
        if (!connection.connected) {
          const message =
            "Google Sheets is not connected. Link it in Lovable before syncing.";
          setSheetError(message);
          if (!silent) toast.error("Google Sheets not connected", { description: message });
          return;
        }

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
    [checkSheetConnection, loadSheet],
  );

  useEffect(() => {
    if (!hydrated) return;
    refreshRecent();
    setDcus(getDCUs());
    const s = getSettings();
    setSettings(s);
    setSessions(getSessions());
    setManifests(getManifests());
    void syncDcusFromSheet(s, true);
  }, [hydrated, syncDcusFromSheet]);

  // Restore the in-progress carton count after a refresh or when an operator
  // returns to a carton number already being worked on.
  useEffect(() => {
    if (!hydrated || mode !== "bulk" || !bulkDcuId || !bulkBoxId) return;
    const count = getScans().filter(
      (scan) => scan.bulkCarton && !scan.sheetsExportedAt && scan.dcuId === bulkDcuId && scan.boxId === bulkBoxId,
    ).length;
    setBulkCount(Math.min(count, 12));
  }, [bulkBoxId, bulkDcuId, hydrated, mode, totalScans]);

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
        const savedInCarton = getScans().filter(
          (scan) => scan.bulkCarton && !scan.sheetsExportedAt && scan.dcuId === bulkDcuId && scan.boxId === bulkBoxId,
        ).length;
        if (savedInCarton >= 12) return;
        const scan = createScan(text, bulkDcuId, bulkBoxId, "assigned", "", activeSession?.id, true);
        addScan(scan);
        const newCount = savedInCarton + 1;
        setBulkCount(newCount);
        refreshRecent();
        if (newCount === 12) {
          toast.success("Carton complete!", {
            description: "Scanning is paused until you approve the next carton.",
          });
          setNextCartonId(
            /^\d+$/.test(bulkBoxId)
              ? String(Number(bulkBoxId) + 1)
              : "",
          );
          setAwaitingNextCarton(true);
        } else {
          toast.success(`Scanned ${newCount}/12`, { description: text });
        }
      } else {
        setScannedSerial(text);
        toast.success("Barcode detected", { description: text });
        if (settings?.autoScan && dcuId && boxId) {
          const scan = createScan(text, dcuId, boxId, status, "", activeSession?.id);
          addScan(scan);
          refreshRecent();
          toast.success("Auto-saved", { description: text });
          setScannedSerial("");
        }
      }
    },
    [mode, bulkBoxId, bulkDcuId, bulkCount, settings, dcuId, boxId, status, activeSession],
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
    addScan(createScan(serial, dcuId, boxId.trim(), status, "", activeSession?.id));
    refreshRecent();
    toast.success("Scan saved", { description: serial });
    setScannedSerial("");
  };

  const handleExportCompletedCartons = async () => {
    if (!settings || !bulkDcuId) return;
    if (completedDcuCartons.length !== 15) {
      toast.error("A DCU must have exactly 15 completed cartons before export");
      return;
    }
    const cartons = completedDcuCartons
      .map((carton) => ({
        boxId: carton.boxId,
        dcuId: carton.dcuId,
        dcuName: dcus.find((dcu) => dcu.id === carton.dcuId)?.name ?? carton.dcuId,
        scans: carton.scans.map((scan) => ({ id: scan.id, meterSerial: scan.meterSerial })),
      }));
    setExportingCartons(true);
    try {
      const result = await exportCartonsToSheets({ data: { spreadsheetId: settings.spreadsheetId, cartons } });
      markScansExported(result.exportedIds);
      refreshRecent();
      setBulkCount(0);
      setAwaitingNextCarton(false);
      toast.success(`Exported ${result.count} meters to ${result.tabs.join(", ")}`, { description: "The 15-carton DCU batch is unlocked for further scanning." });
    } catch (error) {
      toast.error("Carton export failed", { description: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setExportingCartons(false);
    }
  };

  const beginNextCarton = () => {
    if (!nextCartonId.trim()) {
      toast.error("Enter the next carton number before continuing");
      return;
    }
    setBulkBoxId(nextCartonId.trim());
    setBulkCount(0);
    setAwaitingNextCarton(false);
    setNextCartonId("");
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

  const handleBulkDcuChange = (nextDcuId: string) => {
    if (nextDcuId === bulkDcuId) return;
    setBulkDcuId(nextDcuId);
    setBulkCount(0);
    setAwaitingNextCarton(false);
    setNextCartonId("");
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

        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs">
          <span className="text-muted-foreground">Scan session</span>
          <span className="font-medium">{activeSession ? `${activeSession.operator} · ${activeSession.site}` : "No active session"}</span>
        </div>

        <BarcodeScanner
          onScan={handleScan}
          soundEnabled={settings.soundEnabled}
          vibrateOnScan={settings.vibrateOnScan}
          scanCooldownMs={settings.autoScanDelayMs}
          paused={bulkScannerPaused}
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
              {dcuSelect(bulkDcuId, handleBulkDcuChange)}
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
              <span className="text-sm font-medium">Meters in carton · DCU batch</span>
              <span className="font-mono text-2xl font-bold text-primary">
                {bulkCount}
                <span className="text-muted-foreground">/12</span>
              </span>
            </div>
            {bulkDcuId && (
              <p className="text-center text-xs text-muted-foreground">
                {completedDcuCartons.length}/15 completed cartons awaiting export for this DCU
              </p>
            )}
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
            {completedDcuCartons.length === 15 && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleExportCompletedCartons}
                disabled={exportingCartons}
              >
                {exportingCartons
                  ? "Exporting DCU cartons…"
                  : `Export 15 completed ${dcus.find((dcu) => dcu.id === bulkDcuId)?.name ?? "DCU"} cartons to Google Sheets`}
              </Button>
            )}
          </div>
        )}

        {activeCarton && (
          <div className={`rounded-lg border p-3 text-sm ${activeCarton.missing || activeCarton.unexpected ? "border-amber-500/30 bg-amber-500/10" : "border-primary/30 bg-primary/10"}`}>
            <p className="font-medium">Carton check: {activeCarton.found}/{activeCarton.expected} expected serials scanned</p>
            <p className="mt-1 text-xs text-muted-foreground">{activeCarton.missing ? `${activeCarton.missing} still missing` : "No serials missing"}{activeCarton.unexpected ? ` · ${activeCarton.unexpected} unexpected` : ""}</p>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Cartons
          </h2>
          {cartonBlocks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No scanned cartons yet. Complete a 12-meter carton to review it here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {cartonBlocks.map((carton) => (
                <button
                  key={`${carton.dcuId}-${carton.boxId}`}
                  onClick={() => setReviewCarton(carton)}
                  className="slide-in flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-medium">
                      Carton {carton.boxId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {carton.dcuId} · Tap to review meter numbers
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {carton.scans.length}/12
                  </Badge>
                </button>
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

      {/* Required approval between cartons */}
      <Dialog open={awaitingNextCarton && !dcuCartonLimitReached}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Carton complete</DialogTitle>
            <DialogDescription>
              12 meters were saved to carton {bulkBoxId}. Approve and name the next carton to resume scanning.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nextCartonId}
            onChange={(event) => setNextCartonId(event.target.value)}
            placeholder="Next carton number"
            className="font-mono"
            inputMode="numeric"
            autoFocus
          />
          <DialogFooter>
            <Button className="w-full" onClick={beginNextCarton}>Begin next carton</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DCU lock at the 15-carton export threshold */}
      <Dialog open={dcuCartonLimitReached}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>15 cartons ready for export</DialogTitle>
            <DialogDescription>
              This DCU is locked at its 15-carton limit. Export the completed cartons to unlock scanning for this DCU.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="w-full" onClick={handleExportCompletedCartons} disabled={exportingCartons}>
              {exportingCartons ? "Exporting…" : "Export 15 cartons to Google Sheets"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Carton verification table */}
      <Dialog open={!!reviewCarton} onOpenChange={(open) => !open && setReviewCarton(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Carton {reviewCarton?.boxId}</DialogTitle>
            <DialogDescription>{reviewCarton?.dcuId} · {reviewCarton?.scans.length ?? 0}/12 meters</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {reviewCarton?.scans.map((scan, index) => (
              <div key={scan.id} className="flex items-center gap-3 border-b border-border px-3 py-2 font-mono text-sm last:border-0">
                <span className="w-5 text-xs text-muted-foreground">{index + 1}</span>
                {scan.meterSerial}
              </div>
            ))}
          </div>
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

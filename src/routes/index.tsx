import { useState, useEffect, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHydrated } from "@/lib/use-hydrated";
import {
  getScans,
  getDCUs,
  getSettings,
  addScan,
  createScan,
} from "@/lib/storage";
import { STATUS_LABELS } from "@/lib/types";
import type { MeterScan, DCU, AppSettings, ScanStatus } from "@/lib/types";
import { Boxes, CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Scan Meters — MeterTrack" },
      {
        name: "description",
        content: "Scan meter barcodes and assign them to DCUs.",
      },
      { property: "og:title", content: "Scan Meters — MeterTrack" },
      {
        property: "og:description",
        content: "Scan meter barcodes and assign them to DCUs.",
      },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const hydrated = useHydrated();
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
  const lastScanTime = useRef(0);

  useEffect(() => {
    if (hydrated) {
      const scans = getScans();
      setRecentScans(scans.slice(0, 5));
      setTotalScans(scans.length);
      setTotalBoxes(new Set(scans.map((s) => s.boxId)).size);
      setDcus(getDCUs());
      setSettings(getSettings());
    }
  }, [hydrated]);

  const refreshRecent = () => {
    const scans = getScans();
    setRecentScans(scans.slice(0, 5));
    setTotalScans(scans.length);
    setTotalBoxes(new Set(scans.map((s) => s.boxId)).size);
  };

  const handleScan = useCallback(
    (text: string) => {
      const now = Date.now();
      if (now - lastScanTime.current < 500) return;
      lastScanTime.current = now;

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
    if (!scannedSerial.trim()) {
      toast.error("Scan or enter a meter serial");
      return;
    }
    if (!dcuId) {
      toast.error("Select a DCU");
      return;
    }
    if (!boxId.trim()) {
      toast.error("Enter a box ID");
      return;
    }
    const scan = createScan(scannedSerial.trim(), dcuId, boxId.trim(), status);
    addScan(scan);
    refreshRecent();
    toast.success("Scan saved", { description: scannedSerial });
    setScannedSerial("");
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">MeterTrack</h1>
            <p className="text-xs text-muted-foreground">{totalScans} meters scanned</p>
          </div>
          <Badge variant="outline" className="gap-1">
            <Boxes className="h-3 w-3" />
            {totalBoxes} boxes
          </Badge>
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as "single" | "bulk")}
        >
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
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>DCU</Label>
                <Select value={dcuId} onValueChange={setDcuId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select DCU" />
                  </SelectTrigger>
                  <SelectContent>
                    {dcus.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Box/Carton ID</Label>
                <Input
                  value={boxId}
                  onChange={(e) => setBoxId(e.target.value)}
                  placeholder="e.g. BOX-001"
                  className="font-mono"
                />
              </div>
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
            <Button onClick={handleSave} className="w-full" size="lg">
              <Plus className="mr-2 h-4 w-4" /> Save Scan
            </Button>
          </div>
        )}

        {mode === "bulk" && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>DCU</Label>
                <Select value={bulkDcuId} onValueChange={setBulkDcuId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select DCU" />
                  </SelectTrigger>
                  <SelectContent>
                    {dcus.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Box/Carton ID</Label>
                <Input
                  value={bulkBoxId}
                  onChange={(e) => setBulkBoxId(e.target.value)}
                  placeholder="e.g. BOX-001"
                  className="font-mono"
                />
              </div>
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
                : "Set DCU and Box ID first, then start scanning"}
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
                      {scan.dcuId} · {scan.boxId}
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
    </div>
  );
}

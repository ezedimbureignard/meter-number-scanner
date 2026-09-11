import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useHydrated } from "@/lib/use-hydrated";
import {
  getScans,
  getDCUs,
  getSettings,
  updateScan,
  deleteScan,
} from "@/lib/storage";
import { exportToExcel } from "@/lib/export";
import { syncToSheets, checkSheetsConnection } from "@/lib/sheets.functions";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/types";
import type { MeterScan, DCU, AppSettings, ScanStatus } from "@/lib/types";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
  Search,
  Download,
  CloudUpload,
  Pencil,
  Trash2,
  FileSpreadsheet,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — MeterTrack" },
      {
        name: "description",
        content: "View, edit, and export all scanned meters.",
      },
      { property: "og:title", content: "Inventory — MeterTrack" },
      {
        property: "og:description",
        content: "View, edit, and export all scanned meters.",
      },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const hydrated = useHydrated();
  const [scans, setScans] = useState<MeterScan[]>([]);
  const [dcus, setDcus] = useState<DCU[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [search, setSearch] = useState("");
  const [filterDcu, setFilterDcu] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editScan, setEditScan] = useState<MeterScan | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sheetsConnected, setSheetsConnected] = useState(false);

  useEffect(() => {
    if (hydrated) {
      setScans(getScans());
      setDcus(getDCUs());
      setSettings(getSettings());
      checkSheetsConnection().then((r) => setSheetsConnected(r.connected));
    }
  }, [hydrated]);

  const filtered = useMemo(() => {
    let result = scans;
    if (filterDcu !== "all")
      result = result.filter((s) => s.dcuId === filterDcu);
    if (filterStatus !== "all")
      result = result.filter((s) => s.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.meterSerial.toLowerCase().includes(q) ||
          s.boxId.toLowerCase().includes(q) ||
          s.dcuId.toLowerCase().includes(q),
      );
    }
    return result;
  }, [scans, filterDcu, filterStatus, search]);

  const handleExport = async () => {
    if (!settings || filtered.length === 0) {
      toast.error("No data to export");
      return;
    }
    await exportToExcel(filtered, settings.columnConfig);
    toast.success(`Exported ${filtered.length} scans to Excel`);
  };

  const handleSync = async () => {
    if (!settings || filtered.length === 0) {
      toast.error("No data to sync");
      return;
    }
    if (!sheetsConnected) {
      toast.error("Google Sheets not connected", {
        description: "Link the connector in Settings or Lovable connectors.",
      });
      return;
    }
    setSyncing(true);
    try {
      const result = await syncToSheets({
        data: {
          scans: filtered.map((s) => ({
            meterSerial: s.meterSerial,
            dcuId: s.dcuId,
            boxId: s.boxId,
            scanDateTime: s.scanDateTime,
            status: STATUS_LABELS[s.status] ?? s.status,
            notes: s.notes ?? "",
          })),
          spreadsheetId: settings.spreadsheetId,
          sheetName: settings.sheetName,
          columnNames: settings.columnConfig,
        },
      });
      toast.success(`Synced ${result.count} scans to Google Sheets`);
    } catch (err) {
      toast.error("Sync failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveEdit = () => {
    if (!editScan) return;
    updateScan(editScan.id, editScan);
    setScans(getScans());
    setEditScan(null);
    toast.success("Scan updated");
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setScans(deleteScan(deleteId));
    setDeleteId(null);
    toast.success("Scan deleted");
  };

  if (!hydrated || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const cols = settings.columnConfig;

  return (
    <div className="min-h-screen pb-24">
      <header className="border-b border-border bg-card/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Inventory</h1>
            <p className="text-xs text-muted-foreground">
              {scans.length} total · {filtered.length} shown
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={filtered.length === 0}
            >
              <Download className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={filtered.length === 0 || syncing}
            >
              {syncing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="mr-1.5 h-4 w-4" />
              )}
              Sync
            </Button>
          </div>
        </div>
      </header>

      <div className="space-y-3 px-4 py-4">
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search serial, box, DCU…"
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Select value={filterDcu} onValueChange={setFilterDcu}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="All DCUs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All DCUs</SelectItem>
                {dcus.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {scans.length === 0
                ? "No scans yet"
                : "No results match your filters"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {cols.meterSerial}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {cols.dcuId}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {cols.boxId}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {cols.scanDateTime}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {cols.status}
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((scan) => (
                  <tr
                    key={scan.id}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="px-3 py-2 font-mono">{scan.meterSerial}</td>
                    <td className="px-3 py-2">{scan.dcuId}</td>
                    <td className="px-3 py-2 font-mono">{scan.boxId}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(scan.scanDateTime).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded border px-1.5 py-0.5 text-xs ${STATUS_COLORS[scan.status]}`}
                      >
                        {STATUS_LABELS[scan.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setEditScan(scan)}
                        className="mr-1 text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <AlertDialog
                        open={deleteId === scan.id}
                        onOpenChange={(open) => !open && setDeleteId(null)}
                      >
                        <AlertDialogTrigger asChild>
                          <button
                            onClick={() => setDeleteId(scan.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete this scan?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Permanently remove{" "}
                              <span className="font-mono">
                                {scan.meterSerial}
                              </span>{" "}
                              from the inventory.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDelete}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog
        open={!!editScan}
        onOpenChange={(open) => !open && setEditScan(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Scan</DialogTitle>
          </DialogHeader>
          {editScan && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{cols.meterSerial}</Label>
                <Input
                  value={editScan.meterSerial}
                  onChange={(e) =>
                    setEditScan({ ...editScan, meterSerial: e.target.value })
                  }
                  className="font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{cols.dcuId}</Label>
                  <Select
                    value={editScan.dcuId}
                    onValueChange={(v) =>
                      setEditScan({ ...editScan, dcuId: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
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
                  <Label>{cols.boxId}</Label>
                  <Input
                    value={editScan.boxId}
                    onChange={(e) =>
                      setEditScan({ ...editScan, boxId: e.target.value })
                    }
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{cols.status}</Label>
                <Select
                  value={editScan.status}
                  onValueChange={(v) =>
                    setEditScan({ ...editScan, status: v as ScanStatus })
                  }
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
              <div className="space-y-1.5">
                <Label>{cols.notes}</Label>
                <Input
                  value={editScan.notes ?? ""}
                  onChange={(e) =>
                    setEditScan({ ...editScan, notes: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

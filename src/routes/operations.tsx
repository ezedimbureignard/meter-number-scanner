import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Play, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addSession,
  deleteManifest,
  getDCUs,
  getManifests,
  getScans,
  getSessions,
  getSettings,
  saveManifest,
  saveSettings,
  updateSession,
} from "@/lib/storage";
import type { CartonManifest, DCU, MeterScan, ScanSession } from "@/lib/types";
import { useHydrated } from "@/lib/use-hydrated";

export const Route = createFileRoute("/operations")({
  head: () => ({ meta: [{ title: "Operations — MeterTrack" }] }),
  component: OperationsPage,
});

function serialsFrom(value: string) {
  return [...new Set(value.split(/[\n,\t]+/).map((serial) => serial.trim()).filter(Boolean))];
}

function OperationsPage() {
  const hydrated = useHydrated();
  const [scans, setScans] = useState<MeterScan[]>([]);
  const [dcus, setDcus] = useState<DCU[]>([]);
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [manifests, setManifests] = useState<CartonManifest[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [operator, setOperator] = useState("");
  const [site, setSite] = useState("");
  const [shift, setShift] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [boxId, setBoxId] = useState("");
  const [dcuId, setDcuId] = useState("");
  const [expectedSerials, setExpectedSerials] = useState("");

  const refresh = () => {
    setScans(getScans());
    setDcus(getDCUs());
    setSessions(getSessions());
    setManifests(getManifests());
    setActiveSessionId(getSettings().activeSessionId);
  };

  useEffect(() => {
    if (hydrated) refresh();
  }, [hydrated]);

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const verified = scans.filter((scan) => scan.status === "verified").length;
  const reconciliation = useMemo(() => manifests.map((manifest) => {
    const cartonScans = scans.filter((scan) => scan.boxId === manifest.boxId);
    const found = new Set(cartonScans.map((scan) => scan.meterSerial));
    const missing = manifest.expectedSerials.filter((serial) => !found.has(serial));
    const unexpected = cartonScans.filter((scan) => !manifest.expectedSerials.includes(scan.meterSerial));
    const wrongDcu = cartonScans.filter((scan) => scan.dcuId !== manifest.dcuId);
    return { manifest, cartonScans, missing, unexpected, wrongDcu };
  }), [manifests, scans]);

  const exceptionCount = reconciliation.reduce(
    (count, item) => count + item.missing.length + item.unexpected.length + item.wrongDcu.length,
    0,
  ) + (scans.length - verified);

  const startSession = () => {
    if (!operator.trim() || !site.trim()) {
      toast.error("Enter an operator and site to start a session");
      return;
    }
    const session: ScanSession = {
      id: crypto.randomUUID(), operator: operator.trim(), site: site.trim(), shift: shift.trim(),
      notes: sessionNotes.trim(), startedAt: new Date().toISOString(),
    };
    addSession(session);
    saveSettings({ ...getSettings(), activeSessionId: session.id });
    setOperator(""); setSite(""); setShift(""); setSessionNotes("");
    refresh();
    toast.success("Session started");
  };

  const finishSession = () => {
    if (!activeSession) return;
    updateSession(activeSession.id, { endedAt: new Date().toISOString() });
    const nextSettings = { ...getSettings() };
    delete nextSettings.activeSessionId;
    saveSettings(nextSettings);
    refresh();
    toast.success("Session signed off");
  };

  const saveCarton = () => {
    const serials = serialsFrom(expectedSerials);
    if (!boxId.trim() || !dcuId || !serials.length) {
      toast.error("Enter a carton ID, DCU, and at least one expected serial");
      return;
    }
    saveManifest({ id: crypto.randomUUID(), boxId: boxId.trim(), dcuId, expectedSerials: serials, createdAt: new Date().toISOString() });
    setBoxId(""); setDcuId(""); setExpectedSerials("");
    refresh();
    toast.success("Carton manifest saved");
  };

  if (!hydrated) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen space-y-4 pb-24">
      <header className="border-b border-border bg-card/50 px-4 py-3">
        <h1 className="text-xl font-bold tracking-tight">Operations</h1>
        <p className="text-xs text-muted-foreground">Sessions, carton checks, and follow-up work</p>
      </header>
      <div className="space-y-4 px-4">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Scanned" value={scans.length} />
          <Metric label="Verified" value={verified} />
          <Metric label="Exceptions" value={exceptionCount} alert />
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" /> Scan session</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {activeSession ? (
              <div className="space-y-2 rounded-lg bg-secondary p-3">
                <p className="font-medium">{activeSession.operator} · {activeSession.site}</p>
                <p className="text-xs text-muted-foreground">{activeSession.shift || "No shift specified"} · started {new Date(activeSession.startedAt).toLocaleString()}</p>
                <Button className="w-full" variant="outline" onClick={finishSession}><Square className="mr-2 h-4 w-4" /> Sign off session</Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2"><Input value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="Operator name" /><Input value={site} onChange={(event) => setSite(event.target.value)} placeholder="Site / location" /></div>
                <div className="grid grid-cols-2 gap-2"><Input value={shift} onChange={(event) => setShift(event.target.value)} placeholder="Shift (optional)" /><Input value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} placeholder="Notes (optional)" /></div>
                <Button className="w-full" onClick={startSession}><Play className="mr-2 h-4 w-4" /> Start session</Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Carton reconciliation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2"><Input value={boxId} onChange={(event) => setBoxId(event.target.value)} placeholder="Carton ID" /><select value={dcuId} onChange={(event) => setDcuId(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Select DCU</option>{dcus.map((dcu) => <option key={dcu.id} value={dcu.id}>{dcu.name}</option>)}</select></div>
            <div className="space-y-1"><Label>Expected serials</Label><Textarea value={expectedSerials} onChange={(event) => setExpectedSerials(event.target.value)} placeholder="Paste one serial per line, or a comma-separated list" rows={3} /></div>
            <Button className="w-full" onClick={saveCarton}>Save expected carton list</Button>
            {reconciliation.map(({ manifest, cartonScans, missing, unexpected, wrongDcu }) => {
              const issues = missing.length + unexpected.length + wrongDcu.length;
              return <div key={manifest.id} className="rounded-lg border border-border p-3 text-sm"><div className="flex justify-between gap-2"><span className="font-mono font-medium">{manifest.boxId}</span><button onClick={() => { deleteManifest(manifest.id); refresh(); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div><p className="mt-1 text-xs text-muted-foreground">{cartonScans.length}/{manifest.expectedSerials.length} expected scans · {issues ? `${issues} issue${issues === 1 ? "" : "s"}` : "reconciled"}</p>{issues > 0 && <p className="mt-1 text-xs text-amber-400">{missing.length ? `${missing.length} missing` : ""}{missing.length && (unexpected.length || wrongDcu.length) ? " · " : ""}{unexpected.length ? `${unexpected.length} unexpected` : ""}{unexpected.length && wrongDcu.length ? " · " : ""}{wrongDcu.length ? `${wrongDcu.length} wrong DCU` : ""}</p>}</div>;
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4" /> Exception queue</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {scans.filter((scan) => scan.status !== "verified").slice(0, 10).map((scan) => <p key={scan.id} className="rounded border border-amber-500/30 bg-amber-500/10 p-2"><span className="font-mono">{scan.meterSerial}</span> needs verification</p>)}
            {reconciliation.flatMap(({ manifest, missing, unexpected, wrongDcu }) => [
              ...missing.map((serial) => `${manifest.boxId}: missing ${serial}`),
              ...unexpected.map((scan) => `${manifest.boxId}: unexpected ${scan.meterSerial}`),
              ...wrongDcu.map((scan) => `${manifest.boxId}: ${scan.meterSerial} assigned to ${scan.dcuId}`),
            ]).slice(0, 12).map((message) => <p key={message} className="rounded border border-destructive/30 bg-destructive/10 p-2">{message}</p>)}
            {exceptionCount === 0 && <p className="flex items-center gap-2 rounded bg-primary/10 p-3 text-primary"><CheckCircle2 className="h-4 w-4" /> No exceptions to review.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return <div className="rounded-lg border border-border bg-card p-3 text-center"><p className={alert && value > 0 ? "text-xl font-bold text-amber-400" : "text-xl font-bold text-primary"}>{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff, Keyboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { playBeep } from "@/lib/sound";

interface BarcodeScannerProps {
  onScan: (text: string) => void;
  soundEnabled: boolean;
  vibrateOnScan: boolean;
}

export function BarcodeScanner({
  onScan,
  soundEnabled,
  vibrateOnScan,
}: BarcodeScannerProps) {
  const scannerRef = useRef<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const lastScanRef = useRef<{ text: string; time: number }>({ text: "", time: 0 });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const triggerFeedback = useCallback(() => {
    if (soundEnabled) playBeep();
    if (vibrateOnScan && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(100);
    }
    setFlash(true);
    setTimeout(() => setFlash(false), 400);
  }, [soundEnabled, vibrateOnScan]);

  const handleDecoded = useCallback(
    (decodedText: string) => {
      const now = Date.now();
      const last = lastScanRef.current;
      if (decodedText === last.text && now - last.time < 2000) return;
      lastScanRef.current = { text: decodedText, time: now };
      triggerFeedback();
      onScanRef.current(decodedText);
    },
    [triggerFeedback],
  );

  const startScanner = async () => {
    try {
      setError(null);
      const { Html5Qrcode } = await import("html5-qrcode");
      scannerRef.current = new Html5Qrcode("barcode-reader");
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 140 } },
        handleDecoded,
        () => {},
      );
      setIsScanning(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Camera access failed. Check permissions.",
      );
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleManualSubmit = () => {
    const val = manualValue.trim();
    if (val) {
      triggerFeedback();
      onScanRef.current(val);
      setManualValue("");
    }
  };

  return (
    <div className="space-y-3">
      <div
        className={`relative overflow-hidden rounded-xl border-2 border-primary/30 bg-black ${flash ? "success-flash" : ""}`}
      >
        <div
          id="barcode-reader"
          className="w-full"
          style={{ minHeight: !isScanning ? "180px" : "auto" }}
        />
        {!isScanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card">
            <Camera className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Tap Start to scan</p>
          </div>
        )}
        {isScanning && (
          <>
            <div className="pointer-events-none absolute inset-x-4 top-1/2 h-0.5 bg-primary scan-line-bar" />
            <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-primary/40" />
          </>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        {!isScanning ? (
          <Button onClick={startScanner} className="flex-1">
            <Camera className="mr-2 h-4 w-4" /> Start Scanner
          </Button>
        ) : (
          <Button onClick={stopScanner} variant="destructive" className="flex-1">
            <CameraOff className="mr-2 h-4 w-4" /> Stop
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowManual(!showManual)}
        >
          {showManual ? (
            <X className="h-4 w-4" />
          ) : (
            <Keyboard className="h-4 w-4" />
          )}
        </Button>
      </div>

      {showManual && (
        <div className="slide-in flex gap-2">
          <Input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
            placeholder="Type serial & press Enter"
            className="font-mono"
            autoFocus
          />
          <Button onClick={handleManualSubmit}>Add</Button>
        </div>
      )}
    </div>
  );
}

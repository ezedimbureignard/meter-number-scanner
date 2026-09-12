import { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera,
  CameraOff,
  Keyboard,
  X,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { playBeep, playErrorBuzz } from "@/lib/sound";

interface BarcodeScannerProps {
  onScan: (text: string) => void;
  soundEnabled: boolean;
  vibrateOnScan: boolean;
  /** Return true if the value was accepted, false if rejected (e.g. duplicate). */
  validate?: (text: string) => boolean;
}

export function BarcodeScanner({
  onScan,
  soundEnabled,
  vibrateOnScan,
  validate,
}: BarcodeScannerProps) {
  const scannerRef = useRef<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<"none" | "ok" | "bad">("none");
  const [showManual, setShowManual] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);

  const lastScanRef = useRef<{ text: string; time: number }>({
    text: "",
    time: 0,
  });
  const onScanRef = useRef(onScan);
  const validateRef = useRef(validate);
  onScanRef.current = onScan;
  validateRef.current = validate;

  const feedback = useCallback(
    (ok: boolean) => {
      if (soundEnabled) {
        if (ok) playBeep();
        else playErrorBuzz();
      }
      if (vibrateOnScan && typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(ok ? 100 : [80, 60, 80]);
      }
      setFlash(ok ? "ok" : "bad");
      setTimeout(() => setFlash("none"), 450);
    },
    [soundEnabled, vibrateOnScan],
  );

  const handleDecoded = useCallback(
    (decodedText: string) => {
      const text = decodedText.trim();
      const now = Date.now();
      const last = lastScanRef.current;
      if (text === last.text && now - last.time < 2500) return;
      lastScanRef.current = { text, time: now };

      const accepted = validateRef.current ? validateRef.current(text) : true;
      feedback(accepted);
      if (accepted) onScanRef.current(text);
    },
    [feedback],
  );

  /** Pick the best rear camera: prefer a "back"/"rear" labelled device. */
  const pickRearCamera = (devices: { id: string; label: string }[]) => {
    const rear = devices.filter((d) => /back|rear|environment/i.test(d.label));
    if (rear.length > 0) {
      // The last "back" camera is usually the main/wide high-res sensor
      const main = rear.find((d) => /back camera|main|wide/i.test(d.label));
      return devices.indexOf(main ?? rear[0]!);
    }
    return devices.length - 1;
  };

  const applyTrackCapabilities = async (instance: any) => {
    try {
      const caps = instance.getRunningTrackCapabilities?.();
      setTorchSupported(!!caps && "torch" in caps);

      // Push the camera to its highest supported resolution + continuous focus
      const advanced: MediaTrackConstraintSet[] = [];
      if (caps?.focusMode?.includes?.("continuous")) {
        advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
      }
      if (advanced.length) {
        await instance.applyVideoConstraints({ advanced });
      }
    } catch {
      setTorchSupported(false);
    }
  };

  const startScanner = async (deviceIndex?: number) => {
    try {
      setError(null);
      const { Html5Qrcode } = await import("html5-qrcode");

      let devices = cameras;
      if (devices.length === 0) {
        const found = await Html5Qrcode.getCameras();
        devices = found.map((d: any) => ({ id: d.id, label: d.label }));
        setCameras(devices);
      }

      const idx =
        deviceIndex !== undefined ? deviceIndex : pickRearCamera(devices);
      setCameraIndex(idx);

      const instance = new Html5Qrcode("barcode-reader");
      scannerRef.current = instance;

      const cameraTarget =
        devices[idx]?.id ?? ({ facingMode: "environment" } as any);

      await instance.start(
        cameraTarget,
        {
          fps: 15,
          qrbox: (vw: number, vh: number) => {
            const w = Math.floor(Math.min(vw * 0.9, 400));
            return { width: w, height: Math.floor(Math.min(vh * 0.5, w * 0.6)) };
          },
          aspectRatio: 1.7778,
          videoConstraints: {
            deviceId: devices[idx]?.id,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: "environment",
          } as MediaTrackConstraints,
          disableFlip: false,
        },
        handleDecoded,
        () => {},
      );

      setIsScanning(true);
      setTorchOn(false);
      await applyTrackCapabilities(instance);
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
    setTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    const next = !torchOn;
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setError("Flashlight isn't available on this camera.");
    }
  };

  const switchCamera = async () => {
    if (cameras.length < 2) return;
    const next = (cameraIndex + 1) % cameras.length;
    await stopScanner();
    await startScanner(next);
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
    if (!val) return;
    const accepted = validateRef.current ? validateRef.current(val) : true;
    feedback(accepted);
    if (accepted) {
      onScanRef.current(val);
      setManualValue("");
    }
  };

  return (
    <div className="space-y-3">
      <div
        className={`relative overflow-hidden rounded-xl border-2 bg-black transition-colors ${
          flash === "ok"
            ? "success-flash border-primary"
            : flash === "bad"
              ? "error-flash border-destructive"
              : "border-primary/30"
        }`}
      >
        <div
          id="barcode-reader"
          className="w-full"
          style={{ minHeight: !isScanning ? "200px" : "auto" }}
        />
        {!isScanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card">
            <Camera className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Tap Start to scan</p>
          </div>
        )}
        {isScanning && (
          <>
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 bg-primary scan-line-bar" />
            <div className="pointer-events-none absolute inset-5 rounded-lg border-2 border-primary/40" />
            <div className="absolute right-2 top-2 flex flex-col gap-2">
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  aria-label="Toggle flashlight"
                  className={`rounded-full p-2.5 backdrop-blur transition-colors ${
                    torchOn
                      ? "bg-primary text-primary-foreground"
                      : "bg-black/50 text-white"
                  }`}
                >
                  {torchOn ? (
                    <Flashlight className="h-5 w-5" />
                  ) : (
                    <FlashlightOff className="h-5 w-5" />
                  )}
                </button>
              )}
              {cameras.length > 1 && (
                <button
                  onClick={switchCamera}
                  aria-label="Switch camera"
                  className="rounded-full bg-black/50 p-2.5 text-white backdrop-blur"
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        {!isScanning ? (
          <Button onClick={() => startScanner()} className="flex-1" size="lg">
            <Camera className="mr-2 h-4 w-4" /> Start Scanner
          </Button>
        ) : (
          <Button
            onClick={stopScanner}
            variant="destructive"
            className="flex-1"
            size="lg"
          >
            <CameraOff className="mr-2 h-4 w-4" /> Stop
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          aria-label="Manual entry"
          onClick={() => setShowManual(!showManual)}
        >
          {showManual ? <X className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
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
            inputMode="numeric"
            autoFocus
          />
          <Button onClick={handleManualSubmit}>Add</Button>
        </div>
      )}
    </div>
  );
}

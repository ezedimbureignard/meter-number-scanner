import { createFileRoute } from "@tanstack/react-router";
import { ScanPage } from "./index";

export const Route = createFileRoute("/user")({
  head: () => ({ meta: [{ title: "User Scan Workspace — MeterTrack" }] }),
  component: ScanPage,
});

import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Users, MapPin, SlidersHorizontal, ClipboardCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/storage";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin Portal — MeterTrack" }] }),
  component: AdminPortal,
});

function AdminPortal() {
  const user = getCurrentUser();
  if (user?.role !== "admin") return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Administrator access required.</div>;
  const actions = [
    { to: "/settings" as const, title: "Users & DCU locations", description: "Create users, reset access, and manage the master location list.", icon: Users },
    { to: "/settings" as const, title: "Scan limits & system settings", description: "Set the carton scan limit and configure application settings.", icon: SlidersHorizontal },
    { to: "/operations" as const, title: "Operations", description: "Review sessions, carton reconciliation, and exceptions.", icon: ClipboardCheck },
    { to: "/user" as const, title: "User workspace", description: "Open the scan workflow with full administrator access.", icon: MapPin },
  ];
  return <div className="min-h-screen pb-24"><header className="border-b border-border bg-card/50 px-4 py-4"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><div><h1 className="text-xl font-bold">Admin Portal</h1><p className="text-xs text-muted-foreground">Administrator controls for MeterTrack</p></div></div></header><main className="space-y-3 px-4 py-4">{actions.map(({ to, title, description, icon: Icon }) => <Link key={title} to={to} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"><Icon className="h-5 w-5 text-primary" /><div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{description}</p></div></Link>)}</main></div>;
}

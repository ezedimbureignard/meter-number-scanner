import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ScanLine, Table, Settings as SettingsIcon, ChartNoAxesCombined } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentUser, hasUsers, login, logout } from "@/lib/storage";
import type { AppUser, UserRole } from "@/lib/types";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back
          home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ user, onLogout }: { user: AppUser; onLogout: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/user" as const, label: "Scan", icon: ScanLine },
    { to: "/inventory" as const, label: "Inventory", icon: Table },
    ...(user.role === "admin" ? [{ to: "/operations" as const, label: "Operations", icon: ChartNoAxesCombined }] : []),
    ...(user.role === "admin" ? [{ to: "/admin" as const, label: "Admin", icon: SettingsIcon }] : []),
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-stretch">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
      <button onClick={onLogout} className="absolute right-2 top-2 text-[10px] text-muted-foreground">Sign out</button>
    </nav>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
      },
      { title: "MeterTrack — Meter Inventory Scanner" },
      {
        name: "description",
        content:
          "Scan meter barcodes, assign DCUs, and export inventory to Excel or Google Sheets.",
      },
      { name: "author", content: "MeterTrack" },
      { property: "og:title", content: "MeterTrack — Meter Inventory Scanner" },
      {
        property: "og:description",
        content:
          "Scan meter barcodes, assign DCUs, and export inventory to Excel or Google Sheets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { const current = getCurrentUser(); if (current?.enabled === false) logout(); else setUser(current); setReady(true); }, []);
  useEffect(() => { if (user && pathname === "/") void router.navigate({ to: user.role === "admin" ? "/admin" : "/user", replace: true }); }, [user, pathname, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          },
        }}
      />
      {!ready ? null : user && user.enabled !== false ? <><div className="min-h-screen"><Outlet /></div><BottomNav user={user} onLogout={() => { logout(); setUser(null); }} /></> : <AccessScreen onAuthenticated={(nextUser) => { setUser(nextUser); void router.navigate({ to: nextUser.role === "admin" ? "/admin" : "/user" }); }} />}
    </QueryClientProvider>
  );
}

function AccessScreen({ onAuthenticated }: { onAuthenticated: (user: AppUser) => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState<UserRole>("standard");
  const hasConfiguredUsers = typeof window !== "undefined" && hasUsers();
  const submit = () => {
    setError("");
    if (!name.trim() || !password) return setError("Enter a name and password.");
    try {
      if (!hasConfiguredUsers) return setError("No user accounts are configured. Contact an administrator.");
      const user = login(name, password, role);
      if (!user) return setError("Incorrect name, password, role, or disabled account.");
      onAuthenticated(user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to sign in."); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-background px-4"><section className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm"><div><h1 className="text-2xl font-bold">MeterTrack</h1><p className="mt-1 text-sm text-muted-foreground">Sign in with the credentials issued by your administrator.</p></div>{hasConfiguredUsers ? <div className="space-y-3"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Username" autoComplete="username" /><Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" autoComplete="current-password" onKeyDown={(e) => e.key === "Enter" && submit()} /><select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="standard">Standard user</option><option value="admin">Administrator</option></select>{error && <p className="text-sm text-destructive">{error}</p>}<Button className="w-full" onClick={submit}>Sign in</Button></div> : <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">No user accounts are configured. Contact the system administrator.</p>}</section></main>;
}

import * as React from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { useRouter } from "next/router";
import { NAV_USER, NAV_HOST, HISTORY } from "@/lib/mock-data";

// Maps sidebar nav-item ids to actual page routes. Items without a route
// (e.g. `connector`, `settings`, `host-invocations`) stay as no-ops until
// their pages exist.
const NAV_ROUTES: Record<string, string> = {
  // user-mode
  chat: "/landing",
  tasks: "/marketplace",
  agents: "/agents",
  // host-mode
  host: "/host",
  "host-agents": "/agents",
};

export function AppShell({ children, mode = "user", crumbs }: {
  children: React.ReactNode; mode?: "user" | "host"; crumbs: string[];
}) {
  const router = useRouter();
  const nav = mode === "user" ? NAV_USER : NAV_HOST;

  // Highlight whichever nav item maps to the current path; fall back to the
  // first item if the page isn't represented in the nav.
  const currentNav =
    nav.find((n) => NAV_ROUTES[n.id] === router.pathname)?.id ?? nav[0].id;

  const onNav = (id: string) => {
    const route = NAV_ROUTES[id];
    if (route && route !== router.pathname) {
      router.push(route);
    }
  };

  const onSwitchView = (v: "user" | "host") => {
    router.push(v === "user" ? "/" : "/host");
  };

  return (
    <div className="grid grid-cols-[232px_1fr] h-screen overflow-hidden bg-bg">
      <Sidebar
        nav={nav}
        currentNav={currentNav}
        onNav={onNav}
        history={HISTORY}
        onNewChat={() => router.push("/landing")}
        mode={mode}
      />
      <div className="grid grid-rows-[52px_1fr] min-w-0 min-h-0">
        <TopBar crumbs={crumbs} view={mode} onSwitchView={onSwitchView} />
        {children}
      </div>
    </div>
  );
}

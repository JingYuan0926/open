import * as React from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { useRouter } from "next/router";
import { NAV_USER, NAV_HOST, HISTORY } from "@/lib/mock-data";

export function AppShell({ children, mode = "user", crumbs }: {
  children: React.ReactNode; mode?: "user" | "host"; crumbs: string[];
}) {
  const router = useRouter();
  const nav = mode === "user" ? NAV_USER : NAV_HOST;
  const currentNav = nav[0].id;

  const onSwitchView = (v: "user" | "host") => {
    router.push(v === "user" ? "/" : "/host");
  };

  return (
    <div className="grid grid-cols-[232px_1fr] h-screen overflow-hidden bg-bg">
      <Sidebar
        nav={nav}
        currentNav={currentNav}
        onNav={() => {}}
        history={HISTORY}
        onNewChat={() => router.push("/")}
        mode={mode}
      />
      <div className="grid grid-rows-[52px_1fr] min-w-0 min-h-0">
        <TopBar crumbs={crumbs} view={mode} onSwitchView={onSwitchView} />
        {children}
      </div>
    </div>
  );
}

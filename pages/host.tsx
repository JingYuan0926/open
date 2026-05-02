import { useRouter } from "next/router";
import { AppShell } from "@/components/layout/AppShell";
import { HostDashboard } from "@/components/layout/HostDashboard";

export default function HostPage() {
  const router = useRouter();
  return (
    <AppShell mode="host" crumbs={["Right-Hand", "Host Console", "Overview"]}>
      <HostDashboard onAgentClick={(id) => router.push(`/agents/${id}`)} />
    </AppShell>
  );
}

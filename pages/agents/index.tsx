import { AppShell } from "@/components/layout/AppShell";
import { AgentsRegistry } from "@/components/agents/AgentsRegistry";

export default function AgentsIndexPage() {
  return (
    <AppShell mode="user" crumbs={["Right-Hand", "Agents", "Public registry"]}>
      <AgentsRegistry />
    </AppShell>
  );
}

import { AppShell } from "@/components/layout/AppShell";
import { Marketplace } from "@/components/marketplace/Marketplace";

export default function MarketplacePage() {
  return (
    <AppShell mode="user" crumbs={["Right-Hand", "Marketplace", "Open tasks"]}>
      <Marketplace />
    </AppShell>
  );
}

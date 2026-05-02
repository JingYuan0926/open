import { AppShell } from "@/components/layout/AppShell";
import { ChatInterface } from "@/components/chat/ChatInterface";

export default function Home() {
  return (
    <AppShell mode="user" crumbs={["Right-Hand", "Chat", "New task"]}>
      <ChatInterface />
    </AppShell>
  );
}

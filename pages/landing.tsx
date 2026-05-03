import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  ChatInterface,
  itemsToMessages,
  messagesToItems,
  type ChatItem,
} from "@/components/chat/ChatInterface";
import { useChatSessions } from "@/lib/useChatSessions";
import { HISTORY } from "@/lib/mock-data";

const AUTOSAVE_DEBOUNCE_MS = 1500;

// Items worth persisting — skip ephemeral thinking animations.
function persistableItems(items: ChatItem[]): ChatItem[] {
  return items.filter((it) => it.kind !== "thinking");
}

export default function Home() {
  const { address, sessions, save, load, remove } = useChatSessions();

  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null,
  );
  // hydrationKey forces ChatInterface to remount when switching sessions so
  // its internal state resets cleanly.
  const [hydrationKey, setHydrationKey] = React.useState(0);
  const [initialItems, setInitialItems] = React.useState<ChatItem[] | undefined>(
    undefined,
  );
  const [currentItems, setCurrentItems] = React.useState<ChatItem[]>([]);

  // Debounced autosave — fires AUTOSAVE_DEBOUNCE_MS after the last items change.
  // Skips when wallet isn't connected or items array is empty.
  const lastSavedSnapshotRef = React.useRef<string>("");
  React.useEffect(() => {
    if (!address) return;
    const persistable = persistableItems(currentItems);
    if (persistable.length === 0) return;

    const snapshot = JSON.stringify(persistable);
    if (snapshot === lastSavedSnapshotRef.current) return;

    const t = setTimeout(async () => {
      try {
        const session = await save({
          messages: itemsToMessages(persistable),
          sessionId: activeSessionId ?? undefined,
        });
        if (session) {
          lastSavedSnapshotRef.current = snapshot;
          if (!activeSessionId) setActiveSessionId(session.id);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("autosave failed", err);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [currentItems, address, activeSessionId, save]);

  const handlePickHistory = React.useCallback(
    async (id: string) => {
      const session = sessions.find((s) => s.id === id);
      if (!session) return;
      try {
        const messages = await load(session.rootHash);
        const items = messagesToItems(messages);
        setActiveSessionId(session.id);
        setInitialItems(items);
        setCurrentItems(items);
        lastSavedSnapshotRef.current = JSON.stringify(persistableItems(items));
        setHydrationKey((k) => k + 1);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("load chat failed", err);
      }
    },
    [load, sessions],
  );

  const handleNewChat = React.useCallback(() => {
    setActiveSessionId(null);
    setInitialItems([]);
    setCurrentItems([]);
    lastSavedSnapshotRef.current = "";
    setHydrationKey((k) => k + 1);
  }, []);

  const handleDeleteHistory = React.useCallback(
    async (id: string) => {
      // Mock entries aren't backed by a real session — delete is a no-op.
      if (!sessions.some((s) => s.id === id)) return;
      await remove(id);
      if (activeSessionId === id) handleNewChat();
    },
    [remove, sessions, activeSessionId, handleNewChat],
  );

  // Real sessions appear first; mock conversations from lib/mock-data fill in
  // below so the sidebar always has something to browse. Mock entries are
  // inert — picking or deleting them is a no-op (handlers check sessions[]).
  const sidebarHistory = [
    ...sessions.map((s) => ({
      id: s.id,
      label: s.preview || s.filename,
      active: s.id === activeSessionId,
    })),
    ...HISTORY.map((h) => ({
      id: `mock-${h.id}`,
      label: h.label,
      active: false,
    })),
  ];

  return (
    <AppShell
      mode="user"
      crumbs={["Right-Hand", "Chat", activeSessionId ? "Saved chat" : "New task"]}
      history={sidebarHistory}
      onNewChat={handleNewChat}
      onPickHistory={handlePickHistory}
      onDeleteHistory={handleDeleteHistory}
    >
      <ChatInterface
        key={hydrationKey}
        initialItems={initialItems}
        onItemsChange={setCurrentItems}
      />
    </AppShell>
  );
}

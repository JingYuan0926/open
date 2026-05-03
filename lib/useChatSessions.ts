// Client hook for the wallet-scoped chat session list backed by 0G Storage.
// Server I/O lives in pages/api/chat/*.

import * as React from "react";
import { useAccount } from "wagmi";
import type { ChatMessage, ChatSession } from "@/lib/chat-storage";

export type { ChatMessage, ChatSession };

type SaveArgs = {
  messages: ChatMessage[];
  sessionId?: string;
  filename?: string;
};

export function useChatSessions() {
  const { address } = useAccount();
  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!address) {
      setSessions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/chat/list?walletAddress=${address.toLowerCase()}`,
      );
      const data = await res.json();
      if (data.ok) setSessions(data.sessions);
    } finally {
      setLoading(false);
    }
  }, [address]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const save = React.useCallback(
    async (args: SaveArgs): Promise<ChatSession | null> => {
      if (!address) return null;
      setSaving(true);
      try {
        const res = await fetch("/api/chat/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: address,
            messages: args.messages,
            sessionId: args.sessionId,
            filename: args.filename,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        await refresh();
        return data.session as ChatSession;
      } finally {
        setSaving(false);
      }
    },
    [address, refresh],
  );

  const load = React.useCallback(
    async (rootHash: string): Promise<ChatMessage[]> => {
      const res = await fetch(`/api/chat/load?rootHash=${rootHash}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      return data.messages as ChatMessage[];
    },
    [],
  );

  const remove = React.useCallback(
    async (sessionId: string): Promise<boolean> => {
      if (!address) return false;
      const res = await fetch("/api/chat/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, walletAddress: address }),
      });
      const data = await res.json();
      if (data.ok) await refresh();
      return !!data.ok;
    },
    [address, refresh],
  );

  return {
    address,
    sessions,
    loading,
    saving,
    refresh,
    save,
    load,
    remove,
  };
}

import { useEffect, useState } from "react";

export default function Home() {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/clicks")
      .then((r) => r.json())
      .then((d) => setCount(d.count))
      .catch(() => setCount(0));
  }, []);

  async function handleStart() {
    setBusy(true);
    try {
      const res = await fetch("/api/clicks", { method: "POST" });
      const data = await res.json();
      setCount(data.count);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono flex flex-col items-center justify-center gap-6">
      <button
        onClick={handleStart}
        disabled={busy}
        className="bg-white text-black text-lg font-semibold rounded-full px-12 py-4 disabled:opacity-40 hover:bg-zinc-200 transition-colors"
      >
        {busy ? "Starting…" : "Start"}
      </button>
      <p className="text-sm text-zinc-400">
        Clicked {count ?? "…"} {count === 1 ? "time" : "times"}
      </p>
    </div>
  );
}

import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Landing() {
  const router = useRouter();

  useEffect(() => {
    const unlocked = typeof window !== "undefined" && sessionStorage.getItem("rh_chat_unlocked") === "true";
    if (unlocked) router.replace("/chat");
  }, [router]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative bg-surface rounded-3xl border border-border shadow-md w-full max-w-md p-8 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-surface-3 border border-border flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Complete the steps first</h2>
        <p className="text-sm text-ink-3 mb-6">
          Please go back to the home page and complete the Get Started steps before accessing the workspace.
        </p>
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-fg rounded-xl font-medium hover:opacity-90"
        >
          Go to Home
        </button>
      </div>
    </div>
  );
}

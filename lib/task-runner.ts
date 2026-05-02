import { useState, useRef, useEffect, useCallback } from "react";
import { buildScript } from "@/lib/build-script";
import type { ChatMessage, ModeId, RunState, AssistantMessage, ClarifyState } from "@/types";

const interpolate = (s: string, answers: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => answers[k] ?? `{${k}}`);

export function useTaskRunner() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [run, setRun] = useState<RunState | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ msgId: string } | null>(null);
  const [pendingClarify, setPendingClarify] = useState<{ msgId: string; index: number } | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  const at = (ms: number, fn: () => void) => { const t = setTimeout(fn, ms); timersRef.current.push(t); };

  useEffect(() => () => clearTimers(), []);

  const submit = useCallback((prompt: string, mode: ModeId) => {
    clearTimers();
    const script = buildScript(prompt, mode);
    const taskId = "tk_" + Math.random().toString(36).slice(2, 8);
    const userMsg: ChatMessage = { id: "u" + Date.now(), role: "user", content: prompt };
    const useClarify = !!script.clarifies && script.clarifies.length > 0;

    const stepDefs = [
      { title: "Resolving specialists via ENS", meta: `${script.specialists.length} agents discovered`, status: "pending" as const, duration: "120ms" },
      { title: "Establishing AXL channels", meta: "Mesh handshake · authenticated", status: "pending" as const, duration: "84ms" },
    ];
    if (useClarify) {
      script.specialists.forEach((s) => {
        stepDefs.push({ title: `Dispatching to ${s.name}`, meta: s.role, status: "pending" as const, duration: "—" });
      });
    } else {
      stepDefs.push({ title: `Dispatching to ${script.specialists[0].name}`, meta: script.specialists[0].role, status: "pending" as const, duration: "—" });
      if (script.specialists.length > 1) {
        stepDefs.push({ title: `Parallel: ${script.specialists.slice(1).map(s => s.name).join(" + ")}`, meta: "Cross-checking", status: "pending" as const, duration: "—" });
      }
    }
    stepDefs.push({ title: "Synthesizing final report", meta: "Coordinator merging outputs", status: "pending" as const, duration: "—" });

    const initialClarifies: ClarifyState[] = useClarify
      ? script.clarifies!.map((c) => ({ ...c, answers: {}, status: "pending" }))
      : [];

    const assistantMsg: AssistantMessage = {
      id: "a" + Date.now(),
      role: "assistant",
      author: "Right-Hand",
      intro: script.intro,
      steps: stepDefs,
      approval: null,
      clarifies: initialClarifies,
      report: null,
      script,
      taskId,
    };
    setMessages((m) => [...m, userMsg, assistantMsg]);

    setRun({
      taskId, taskTitle: prompt, phase: "routing",
      specialists: script.specialists.map((s, i) => ({ ...s, state: i === 0 ? "active" : "queued" })),
      approvalCount: 0, memSize: 0, cost: "$0.00",
    });
    setBusy(true);
    setPendingApproval(null);
    setPendingClarify(null);

    const updateAssistant = (patch: (m: AssistantMessage) => Partial<AssistantMessage>) => {
      setMessages((msgs) => msgs.map((m) => m.id === assistantMsg.id && m.role === "assistant" ? { ...m, ...patch(m) } : m));
    };
    const setStep = (i: number, status: "active" | "done", duration?: string) => updateAssistant((m) => ({
      steps: m.steps.map((s, idx) => idx === i ? { ...s, status, duration: duration ?? s.duration } : s),
    }));

    at(100, () => setStep(0, "active"));
    at(700, () => { setStep(0, "done"); setStep(1, "active"); setRun((r) => r ? { ...r, phase: "discovering", memSize: 4 } : r); });
    at(1400, () => { setStep(1, "done"); setStep(2, "active"); setRun((r) => r ? { ...r, phase: "executing", memSize: 7 } : r); });

    if (useClarify) {
      at(2200, () => {
        setRun((r) => r ? { ...r, phase: "clarify" } : r);
        setPendingClarify({ msgId: assistantMsg.id, index: 0 });
      });
    } else {
      at(2200, () => {
        updateAssistant(() => ({ approval: { actor: script.approvalActor, command: script.approvalCmd, status: "pending" } }));
        setPendingApproval({ msgId: assistantMsg.id });
        setRun((r) => r ? { ...r, phase: "approval", approvalCount: 1 } : r);
      });
    }
  }, []);

  const resolveApproval = useCallback((decision: "approved" | "denied") => {
    setPendingApproval((prev) => {
      if (!prev) return null;
      const msgId = prev.msgId;
      setMessages((msgs) => msgs.map((m) => m.id === msgId && m.role === "assistant" ? { ...m, approval: m.approval ? { ...m.approval, status: decision } : null } : m));
      setRun((r) => r ? { ...r, phase: "executing", approvalCount: 0, memSize: 11 } : r);
      const after = decision === "approved" ? 600 : 800;
      at(after, () => {
        setMessages((msgs) => msgs.map((m) => {
          if (m.id !== msgId || m.role !== "assistant") return m;
          const steps = m.steps.map((s, idx) => idx === 2 ? { ...s, status: "done" as const, duration: "1.2s" } : s);
          if (steps[3]) steps[3] = { ...steps[3], status: "active" as const };
          return { ...m, steps };
        }));
        setRun((r) => r ? { ...r, specialists: r.specialists.map((s, i) => ({ ...s, state: i === 0 ? "done" : "active" })), memSize: 18 } : r);
      });
      at(after + 1200, () => {
        setMessages((msgs) => msgs.map((m) => {
          if (m.id !== msgId || m.role !== "assistant") return m;
          const steps = m.steps.map((s, idx) => {
            if (idx === 3 && s.title.startsWith("Parallel")) return { ...s, status: "done" as const, duration: "1.6s" };
            if (idx === m.steps.length - 1) return { ...s, status: "active" as const };
            return s;
          });
          return { ...m, steps };
        }));
        setRun((r) => r ? { ...r, phase: "finishing", specialists: r.specialists.map(s => ({ ...s, state: "done" })), memSize: 24 } : r);
      });
      at(after + 2200, () => {
        setMessages((msgs) => msgs.map((m) => {
          if (m.id !== msgId || m.role !== "assistant") return m;
          const steps = m.steps.map((s, idx) => idx === m.steps.length - 1 ? { ...s, status: "done" as const, duration: "0.6s" } : s);
          return { ...m, steps, report: { title: m.script.reportTitle, items: m.script.reportItems } };
        }));
        setRun((r) => r ? { ...r, phase: "done", memSize: 31, cost: "$0.54" } : r);
        setBusy(false);
      });
      return null;
    });
  }, []);

  const resolveClarify = useCallback((index: number, answers: Record<string, string>) => {
    setPendingClarify((prev) => {
      if (!prev || prev.index !== index) return prev;
      const msgId = prev.msgId;

      setMessages((msgs) => msgs.map((m) => {
        if (m.id !== msgId || m.role !== "assistant") return m;
        const clarifies = m.clarifies.map((c, i) => i === index ? { ...c, answers, status: "answered" as const } : c);
        return { ...m, clarifies };
      }));

      setMessages((current) => {
        const target = current.find((m) => m.id === msgId);
        if (!target || target.role !== "assistant") return current;
        const totalClarifies = target.script.clarifies?.length ?? 0;
        const isLast = index >= totalClarifies - 1;
        const dispatchStepIndex = 2 + index;

        at(500, () => {
          setStepStatus(msgId, dispatchStepIndex, "done", "1.4s");
          if (!isLast) setStepStatus(msgId, dispatchStepIndex + 1, "active");
          setRun((r) => r ? {
            ...r,
            phase: isLast ? "finishing" : "executing",
            memSize: r.memSize + 6,
            specialists: r.specialists.map((s, i) => ({
              ...s,
              state: i <= index ? "done" : i === index + 1 ? "active" : "queued",
            })),
          } : r);
        });

        if (!isLast) {
          at(1300, () => setPendingClarify({ msgId, index: index + 1 }));
        } else {
          at(1300, () => {
            setMessages((msgs) => msgs.map((m) => {
              if (m.id !== msgId || m.role !== "assistant") return m;
              const last = m.steps.length - 1;
              const steps = m.steps.map((s, idx) => idx === last ? { ...s, status: "active" as const } : s);
              return { ...m, steps };
            }));
            setRun((r) => r ? { ...r, phase: "finishing", memSize: 24 } : r);
          });
          at(2400, () => {
            setMessages((msgs) => msgs.map((m) => {
              if (m.id !== msgId || m.role !== "assistant") return m;
              const last = m.steps.length - 1;
              const steps = m.steps.map((s, idx) => idx === last ? { ...s, status: "done" as const, duration: "0.7s" } : s);
              const allAnswers = m.clarifies.reduce<Record<string, string>>((acc, c) => ({ ...acc, ...c.answers }), {});
              const items = m.script.reportItems.map((item) => interpolate(item, allAnswers));
              return { ...m, steps, report: { title: m.script.reportTitle, items } };
            }));
            setRun((r) => r ? {
              ...r,
              phase: "done",
              memSize: 31,
              cost: "$0.78",
              specialists: r.specialists.map((s) => ({ ...s, state: "done" })),
            } : r);
            setBusy(false);
          });
        }
        return current;
      });

      return null;
    });
  }, []);

  const setStepStatus = (msgId: string, stepIndex: number, status: "active" | "done", duration?: string) => {
    setMessages((msgs) => msgs.map((m) => {
      if (m.id !== msgId || m.role !== "assistant") return m;
      const steps = m.steps.map((s, idx) => idx === stepIndex ? { ...s, status, duration: duration ?? s.duration } : s);
      return { ...m, steps };
    }));
  };

  return { messages, run, busy, pendingApproval, pendingClarify, submit, resolveApproval, resolveClarify };
}

import type { ModeId, TaskScript } from "@/types";

export function buildScript(prompt: string, mode: ModeId): TaskScript {
  const isJapan = /japan|trip/i.test(prompt);
  const isWifi = /wifi|wi-?fi/i.test(prompt);
  const isAws = /aws|cloud/i.test(prompt);

  let coordinator = "Coordinator";
  let specialists = [
    { id: "OC", name: "OpenClaw Setup Specialist", role: "Bootstrap" },
    { id: "DP", name: "Dependency Specialist", role: "Resolve" },
    { id: "VF", name: "Verification Specialist", role: "Verify" },
  ];
  let intro = "Routing to three specialists: bootstrap, dependencies, verification. Nothing local will run without your approval.";
  let approvalCmd = "node --version";
  let approvalActor = "Dependency Specialist wants to check your Node runtime before installing OpenClaw.";
  let reportTitle = "OpenClaw installed and sample agent verified";
  let reportItems = [
    "Discovered specialists via ENS (3 found)",
    "Resolved Node 20.11.1 — meets OpenClaw ≥ 18 requirement",
    "Installed openclaw@0.6.2 via npm (no peer warnings)",
    "Scaffolded sample agent in ./openclaw-sample",
    "Ran verification: sample agent responded in 412ms",
  ];

  if (isJapan) {
    specialists = [
      { id: "TR", name: "Travel Itinerary Specialist", role: "Plan" },
      { id: "BG", name: "Budget Specialist", role: "Cost-balance" },
      { id: "FL", name: "Flights Specialist", role: "Routing" },
    ];
    intro = "Three specialists working in parallel — itinerary, flights, budget. I'll consolidate into one plan.";
    approvalCmd = "fetch https://api.flights.example/search?from=SFO&to=NRT";
    approvalActor = "Flights Specialist wants to query a flight pricing API.";
    reportTitle = "10-day Japan plan within $1,184 budget";
    reportItems = [
      "Round-trip SFO→NRT flights routed for $612 (mid-week)",
      "7-night Tokyo + 2-night Kyoto lodging at $48/night avg",
      "JR Pass (7-day) included — covers 9 of 12 train segments",
      "Daily food budget: $32/day, slack of $18 for one nice dinner",
      "Total: $1,184 — $16 under target",
    ];
  } else if (isWifi) {
    specialists = [
      { id: "NW", name: "Network Diagnostic Specialist", role: "Diagnose" },
      { id: "VF", name: "Verification Specialist", role: "Verify" },
    ];
    intro = "Pair mode. Diagnostic proposes, verification confirms. Read-only until you approve a change.";
    approvalCmd = "ipconfig /all";
    approvalActor = "Network Diagnostic Specialist wants to read your network adapter state.";
    reportTitle = "WiFi restored";
    reportItems = [
      "Adapter Intel AX211 reset successfully",
      "DHCP lease renewed (192.168.1.142)",
      "DNS resolution verified (1.1.1.1 reachable)",
      "Speed test: 287 Mbps down / 41 Mbps up",
    ];
  } else if (isAws) {
    specialists = [
      { id: "AW", name: "AWS Config Specialist", role: "Plan" },
      { id: "VF", name: "Verification Specialist", role: "Critique" },
    ];
    intro = "Plan, critique for least-privilege, preview the diff. Nothing applies without your approval.";
    approvalCmd = "aws iam simulate-principal-policy --policy-source-arn $ROLE";
    approvalActor = "AWS Config Specialist wants to simulate the proposed IAM policy.";
    reportTitle = "Policy preview ready — awaiting apply";
    reportItems = [
      "Read 14 existing IAM policies attached to staging-deploy",
      "Drafted minimal policy: 6 actions across 2 resources",
      "Critique pass: removed 3 wildcard ARNs",
      "Simulated against 22 representative actions — no drift",
      "Diff ready to apply on your confirmation",
    ];
  }

  if (mode === "solo") specialists = specialists.slice(0, 1);
  else if (mode === "pair") specialists = specialists.slice(0, 2);
  else if (mode === "deep") {
    specialists = [
      ...specialists,
      { id: "PL", name: "Planner", role: "Plan" },
      { id: "CR", name: "Critic", role: "Critique" },
    ];
  }
  return { coordinator, specialists, intro, approvalCmd, approvalActor, reportTitle, reportItems };
}

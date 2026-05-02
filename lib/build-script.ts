import type { ModeId, TaskScript, ClarifyDef } from "@/types";

export function buildScript(prompt: string, mode: ModeId): TaskScript {
  const isJapan = /japan|trip/i.test(prompt);
  const isWifi = /wifi|wi-?fi/i.test(prompt);
  const isAwsOpenclaw = /(openclaw.*ec2|ec2.*openclaw|openclaw.*aws|aws.*openclaw|deploy.*openclaw|openclaw.*server)/i.test(prompt);
  const isAws = !isAwsOpenclaw && /aws|cloud/i.test(prompt);

  let coordinator = "Coordinator";
  let specialists = [
    { id: "OC", name: "OpenClaw Setup Specialist", role: "Bootstrap" },
    { id: "DP", name: "Dependency Specialist", role: "Resolve" },
    { id: "VF", name: "Verification Specialist", role: "Verify" },
  ];
  let intro = "Routing to three specialists: bootstrap, dependencies, verification. Nothing local will run without your approval.";
  let approvalCmd = "node --version";
  let approvalActor = "Dependency Specialist wants to check your Node runtime before installing OpenClaw.";
  let clarifies: ClarifyDef[] | undefined;
  let reportTitle = "OpenClaw installed and sample agent verified";
  let reportItems = [
    "Discovered specialists via ENS (3 found)",
    "Resolved Node 20.11.1 — meets OpenClaw ≥ 18 requirement",
    "Installed openclaw@0.6.2 via npm (no peer warnings)",
    "Scaffolded sample agent in ./openclaw-sample",
    "Ran verification: sample agent responded in 412ms",
  ];

  if (isAwsOpenclaw) {
    specialists = [
      { id: "AW", name: "AWS Provisioning Specialist", role: "Provision" },
      { id: "OC", name: "OpenClaw Deployment Specialist", role: "Deploy" },
    ];
    intro = "Pair mode. AWS provisioning launches the box; OpenClaw deployment SSHes in to install and configure. I'll ask a couple things before each agent runs.";
    clarifies = [
      {
        actor: "AWS Provisioning Specialist",
        context: "Before I authenticate to AWS and launch the EC2 instance, two things to confirm.",
        questions: [
          {
            id: "region",
            question: "Which AWS region should I provision in?",
            options: [
              { label: "us-east-1", description: "Virginia · default for US East" },
              { label: "us-west-2", description: "Oregon · default for US West" },
              { label: "eu-west-1", description: "Ireland · default for EU" },
              { label: "ap-southeast-1", description: "Singapore · default for SEA" },
            ],
          },
          {
            id: "instanceType",
            question: "What instance size?",
            options: [
              { label: "t3.micro", description: "Free tier · 1 vCPU, 1 GB RAM" },
              { label: "t3.small", description: "$15/mo · 2 vCPU, 2 GB RAM" },
              { label: "t3.medium", description: "$30/mo · 2 vCPU, 4 GB RAM" },
            ],
          },
        ],
      },
      {
        actor: "OpenClaw Deployment Specialist",
        context: "Box is up. Two choices on how I should install OpenClaw.",
        questions: [
          {
            id: "version",
            question: "Which OpenClaw version?",
            options: [
              { label: "0.6.2", description: "Stable · recommended for production" },
              { label: "0.7.0-rc", description: "Preview features · pre-release, not for prod" },
            ],
          },
          {
            id: "password",
            question: "How should I set the admin password?",
            options: [
              { label: "Auto-generated", description: "Strong random password, surfaced at the end" },
              { label: "Prompted on install", description: "You'll type it interactively over SSH" },
            ],
          },
        ],
      },
    ];
    reportTitle = "EC2 provisioned, OpenClaw deployed";
    reportItems = [
      "Launched {instanceType} in {region} · ec2-3-92-145-71.{region}.compute.amazonaws.com",
      "Security group attached: SSH (22), OpenClaw API (8443)",
      "SSH'd in via ephemeral keypair (rotated after deploy)",
      "Installed OpenClaw {version} from the official tarball",
      "Configured systemd unit · openclaw.service is active",
      "Admin password: {password}",
      "Quickstart guide saved to your 0G workspace",
    ];
  } else if (isJapan) {
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
  return { coordinator, specialists, intro, approvalCmd, approvalActor, clarifies, reportTitle, reportItems };
}

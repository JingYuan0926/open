// Required runtime capabilities every published specialist must have
// installed locally. Surfaced read-only in the publish form so hosts know
// what their agent needs before they hit "Publish Specialist". No on-chain
// record, no enforcement — purely informational.

export type SkillId =
  | "computer-use"
  | "playwright"
  | "chrome-extension"
  | "webrtc"
  | "vnc"
  | "apache-guacamole";

export type SkillDef = {
  id: SkillId;
  label: string;
  tagline: string;
};

export const SKILL_CATALOG: readonly SkillDef[] = [
  {
    id: "computer-use",
    label: "Computer use",
    tagline: "Primary — pixel-vision + click anywhere on screen",
  },
  {
    id: "playwright",
    label: "Playwright",
    tagline:
      "Preferred when target is a webpage with stable DOM (faster, more reliable)",
  },
  {
    id: "chrome-extension",
    label: "Chrome extension",
    tagline:
      "Even faster — direct DOM manipulation without launching a separate Chromium",
  },
  {
    id: "webrtc",
    label: "WebRTC",
    tagline: "Transport when controlling a remote machine's screen",
  },
  {
    id: "vnc",
    label: "VNC",
    tagline: "Transport fallback when WebRTC won't traverse NAT",
  },
  {
    id: "apache-guacamole",
    label: "Apache Guacamole",
    tagline: "When the controller needs to be browser-only (not native client)",
  },
] as const;

// axl/mcp-servers/permission.ts
//
// Terminal-based y/n approval gate for inbound MCP tool calls.
//
// Why a queue: stdin is global to the process. If two MCP calls arrive
// simultaneously, both readline.question() reads would race on the same TTY.
// We serialize prompts with a promise chain so only one is active at a time.

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

let chain: Promise<unknown> = Promise.resolve();

export interface ApprovalRequest {
  fromRole: string;
  service: string;
  tool: string;
  args: unknown;
}

export async function promptApproval(req: ApprovalRequest): Promise<boolean> {
  const next = chain.then(() => actuallyPrompt(req));
  chain = next.catch(() => false);
  return next;
}

async function actuallyPrompt(req: ApprovalRequest): Promise<boolean> {
  const yellow = "\x1b[1;33m";
  const cyan = "\x1b[36m";
  const green = "\x1b[32m";
  const red = "\x1b[31m";
  const reset = "\x1b[0m";

  // Default behaviour: auto-approve. Set MCP_REQUIRE_APPROVAL=1 to bring back
  // the interactive y/n prompt (e.g. when filming the approval-gate part of
  // the demo).
  if (process.env.MCP_REQUIRE_APPROVAL !== "1") {
    const argsStr = (() => {
      try { return JSON.stringify(req.args); }
      catch { return String(req.args); }
    })();
    console.log(
      `\n${yellow}[mcp]${reset} ${cyan}${req.fromRole}${reset} → ${req.service}.${req.tool}(${argsStr}) ${green}auto-approved${reset}`,
    );
    return true;
  }

  const argsStr = (() => {
    try { return JSON.stringify(req.args); }
    catch { return String(req.args); }
  })();

  const prompt = `\n${yellow}[mcp]${reset} ${cyan}${req.fromRole}${reset} → ${req.service}.${req.tool}(${argsStr})\n      approve? (y/n): `;

  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    const ok = answer === "y" || answer === "yes";
    console.log(ok ? `${green}      → approved${reset}` : `${red}      → denied${reset}`);
    return ok;
  } finally {
    rl.close();
  }
}

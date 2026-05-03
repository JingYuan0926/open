---
name: computer-use
description: Look at the user's screen and click/type/scroll anywhere — native dialogs, OS chrome, any app. Vision-driven via Anthropic's `computer_20250124` tool.
priority: primary
when_to_use: When the target is a native dialog, a desktop app, an image-only region, OS-level UI, or any web page where the DOM isn't reliably reachable. The default skill for "click what I see."
when_to_skip: When the target is a webpage with a stable selector — `playwright` is faster and more deterministic. When you're already inside the user's Chrome session — `chrome-extension` is even faster.
---

# computer-use

Drive the user's screen by alternating **screenshot → model decision → execute action**. The model is Claude (Sonnet 4.6 or Opus 4.7); the tool is Anthropic's built-in `computer_20250124`. The execute side runs locally and uses OS-level screen capture + input injection.

## Required setup

```bash
npm install @anthropic-ai/sdk screenshot-desktop @nut-tree-fork/nut-js
```

Env:
```
ANTHROPIC_API_KEY=sk-ant-...
```

macOS permission grants (System Settings → Privacy & Security):
- **Screen Recording** → required for screen capture. Without this, screenshots come back as a black rectangle.
- **Accessibility** → required for input injection. Without this, every click and keystroke silently no-ops.

Trigger the prompts on first run by calling `screenshot()` and `mouse.click(0,0)` once during connector setup.

## API surface (the loop)

The agent owns one function: `runComputerUseLoop(goal: string)`. Internally:

```ts
import Anthropic from "@anthropic-ai/sdk";
import screenshot from "screenshot-desktop";
import { mouse, keyboard, Button, Key, Point } from "@nut-tree-fork/nut-js";

const client = new Anthropic();

const DISPLAY_WIDTH = 1512;     // logical pixels — match the model's coord space
const DISPLAY_HEIGHT = 982;
const TOOL = {
  type: "computer_20250124" as const,
  name: "computer",
  display_width_px: DISPLAY_WIDTH,
  display_height_px: DISPLAY_HEIGHT,
  display_number: 0,
};

export async function runComputerUseLoop(goal: string, maxSteps = 30) {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: goal },
  ];

  for (let i = 0; i < maxSteps; i++) {
    const resp = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      tools: [TOOL],
      messages,
      betas: ["computer-use-2025-01-24"],
    });

    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "end_turn") return resp;

    // Execute every tool_use block the model emitted, append tool_result blocks.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      const result = await executeAction(block.input as ComputerAction);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.screenshot
          ? [{ type: "image", source: { type: "base64", media_type: "image/png", data: result.screenshot } }]
          : result.text ?? "",
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Hit max ${maxSteps} steps without end_turn`);
}
```

## Action executor

Map every `computer_20250124` action type to a real OS call. This is the one place where library calls land:

```ts
type ComputerAction =
  | { action: "screenshot" }
  | { action: "mouse_move"; coordinate: [number, number] }
  | { action: "left_click"; coordinate?: [number, number] }
  | { action: "right_click"; coordinate?: [number, number] }
  | { action: "middle_click"; coordinate?: [number, number] }
  | { action: "double_click"; coordinate?: [number, number] }
  | { action: "triple_click"; coordinate?: [number, number] }
  | { action: "left_click_drag"; coordinate: [number, number] }
  | { action: "scroll"; coordinate: [number, number]; scroll_direction: "up"|"down"|"left"|"right"; scroll_amount: number }
  | { action: "key"; text: string }                         // e.g. "cmd+t", "Return"
  | { action: "type"; text: string }
  | { action: "wait"; duration: number }                    // seconds
  | { action: "cursor_position" };

async function executeAction(a: ComputerAction): Promise<{ screenshot?: string; text?: string }> {
  switch (a.action) {
    case "screenshot": {
      const buf = await screenshot({ format: "png" });
      return { screenshot: buf.toString("base64") };
    }
    case "mouse_move":
      await mouse.move([new Point(a.coordinate[0], a.coordinate[1])]);
      return { text: "ok" };
    case "left_click":
      if (a.coordinate) await mouse.move([new Point(a.coordinate[0], a.coordinate[1])]);
      await mouse.click(Button.LEFT);
      return { screenshot: (await screenshot({ format: "png" })).toString("base64") };
    case "right_click":
      if (a.coordinate) await mouse.move([new Point(a.coordinate[0], a.coordinate[1])]);
      await mouse.click(Button.RIGHT);
      return { screenshot: (await screenshot({ format: "png" })).toString("base64") };
    case "double_click":
      if (a.coordinate) await mouse.move([new Point(a.coordinate[0], a.coordinate[1])]);
      await mouse.doubleClick(Button.LEFT);
      return { screenshot: (await screenshot({ format: "png" })).toString("base64") };
    case "left_click_drag":
      await mouse.drag([new Point(a.coordinate[0], a.coordinate[1])]);
      return { screenshot: (await screenshot({ format: "png" })).toString("base64") };
    case "scroll": {
      const fn = { up: mouse.scrollUp, down: mouse.scrollDown, left: mouse.scrollLeft, right: mouse.scrollRight }[a.scroll_direction];
      await mouse.move([new Point(a.coordinate[0], a.coordinate[1])]);
      await fn.call(mouse, a.scroll_amount);
      return { screenshot: (await screenshot({ format: "png" })).toString("base64") };
    }
    case "key":
      await pressHotkey(a.text);  // see below
      return { screenshot: (await screenshot({ format: "png" })).toString("base64") };
    case "type":
      await keyboard.type(a.text);
      return { screenshot: (await screenshot({ format: "png" })).toString("base64") };
    case "wait":
      await new Promise(r => setTimeout(r, a.duration * 1000));
      return { text: "ok" };
    case "cursor_position":
      const p = await mouse.getPosition();
      return { text: `(${p.x}, ${p.y})` };
  }
}

async function pressHotkey(text: string) {
  // "cmd+shift+t" → [Key.LeftCmd, Key.LeftShift, Key.T]
  const KEY_MAP: Record<string, Key> = {
    cmd: Key.LeftCmd, ctrl: Key.LeftControl, shift: Key.LeftShift, alt: Key.LeftAlt,
    return: Key.Return, enter: Key.Return, tab: Key.Tab, escape: Key.Escape, esc: Key.Escape,
    space: Key.Space, backspace: Key.Backspace, delete: Key.Delete,
    up: Key.Up, down: Key.Down, left: Key.Left, right: Key.Right,
  };
  const parts = text.toLowerCase().split("+").map(s => s.trim());
  const keys = parts.map(p => {
    if (KEY_MAP[p]) return KEY_MAP[p];
    if (p.length === 1) return (Key as any)[p.toUpperCase()];
    throw new Error(`Unknown key: ${p}`);
  });
  await keyboard.pressKey(...keys);
  await keyboard.releaseKey(...keys);
}
```

## When to fall back

| failure signal | fall back to |
|---|---|
| Model returns `"I cannot see..."` or asks for higher resolution | Re-screenshot the same region with `getScreenshot({ region })`; if still ambiguous → try `playwright` if target is a webpage |
| Click executes but page state doesn't change after 3 retries | Target may be a webpage — check `document.readyState` via `playwright.page.evaluate()`; switch to `playwright` for selector-based click |
| Screen Recording / Accessibility not granted | Surface the OS permission settings link; do not retry until user grants |
| Action throws `Error: target window not found` | The target window was closed or moved off-screen — re-screenshot, ask model to relocate |

## Security

- Every action goes through the per-action approval gate (see `axl/mcp-servers/permission.ts`) before execution unless the agent is operating under a session-level approval the user has explicitly signed.
- Sensitive fields (password inputs, credit card numbers) should be detected by the executor — if the model emits `type "..."` while a focused element matches `input[type=password]`, prompt the user every single time regardless of session approval.
- Screenshots may contain secrets. Don't ship them off-host; the loop runs against Anthropic's API which is the only network egress the screenshot bytes ever take.

## Cost / latency notes

- Each step ≈ 1 model call ≈ 2–4s + ~$0.01–0.05 depending on model and screenshot size.
- For multi-step tasks, prefer Sonnet (`claude-sonnet-4-6`) over Opus — comparable reliability for computer use, ~3× cheaper, ~2× faster.
- Cache the system prompt (`cache_control: { type: "ephemeral" }` on a system block) — saves a chunk of tokens across the loop.

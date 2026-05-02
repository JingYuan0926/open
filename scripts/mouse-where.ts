// scripts/mouse-where.ts — live cursor-position readout.
//
// Run this, hover your mouse over the button you want the demo cursor to land
// on, note the X,Y values, then plug them into MOUSE_TO_X / MOUSE_TO_Y env
// vars (or hardcode in test-browser.ts).
//
// Ctrl+C to stop.

import { getCursorPosition, getScreenSize } from "../axl/mcp-servers/aws-helpers/mouse";

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

(async () => {
  const screen = await getScreenSize();
  console.log(`${cyan}━━ mouse:where ━━${reset}`);
  console.log(`${dim}screen: ${screen.width}x${screen.height}${reset}`);
  console.log(`${dim}Hover over a button on your AWS page; note the X,Y. Ctrl+C to stop.${reset}\n`);

  setInterval(() => {
    const p = getCursorPosition();
    const px = ((p.x / screen.width) * 100).toFixed(1);
    const py = ((p.y / screen.height) * 100).toFixed(1);
    process.stdout.write(`\r  ${yellow}X=${p.x}${reset}  ${yellow}Y=${p.y}${reset}    ${dim}(${px}% × ${py}%)        ${reset}`);
  }, 100);
})();

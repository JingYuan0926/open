# axl/mcp-servers/aws-helpers/move_mouse.ps1
#
# Smoothly animate the Windows cursor from (FromX,FromY) to (ToX,ToY) over
# DurationMs milliseconds, then optionally perform a left-click. Uses
# smoothstep easing for a natural feel.
#
# Invoked from WSL TypeScript via:
#   powershell.exe -ExecutionPolicy Bypass -File <wsl-translated-path> \
#     -FromX 200 -FromY 600 -ToX 1200 -ToY 250 -DurationMs 1500 [-Click]
#
# Coordinates are in pixels relative to the primary monitor's top-left.
# Use `[System.Windows.Forms.Screen]::PrimaryScreen.Bounds` to discover.

param(
  [int]$FromX = -1,
  [int]$FromY = -1,
  [Parameter(Mandatory=$true)] [int]$ToX,
  [Parameter(Mandatory=$true)] [int]$ToY,
  [int]$DurationMs = 1200,
  [int]$Steps = 60,
  [switch]$Click
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Default From{X,Y} to current cursor position so the glide doesn't "teleport"
# the cursor to a fixed start before animating.
if ($FromX -lt 0 -or $FromY -lt 0) {
  $current = [System.Windows.Forms.Cursor]::Position
  if ($FromX -lt 0) { $FromX = $current.X }
  if ($FromY -lt 0) { $FromY = $current.Y }
}

$delayMs = [int]($DurationMs / $Steps)

for ($i = 0; $i -le $Steps; $i++) {
  $t = $i / $Steps
  # smoothstep easing: 3t² - 2t³ — slow start + slow end
  $eased = $t * $t * (3 - 2 * $t)
  $x = [int]($FromX + ($ToX - $FromX) * $eased)
  $y = [int]($FromY + ($ToY - $FromY) * $eased)
  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
  Start-Sleep -Milliseconds $delayMs
}

if ($Click) {
  Add-Type -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, System.IntPtr dwExtraInfo);
"@ -Name MouseEventHelper -Namespace WinUtil
  # MOUSEEVENTF_LEFTDOWN = 0x0002, LEFTUP = 0x0004
  [WinUtil.MouseEventHelper]::mouse_event(0x0002, 0, 0, 0, [System.IntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [WinUtil.MouseEventHelper]::mouse_event(0x0004, 0, 0, 0, [System.IntPtr]::Zero)
}

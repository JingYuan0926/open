#!/usr/bin/env bash
# start.sh — OpenClaw boot launcher.

set -euo pipefail
cd "$(dirname "$0")"

red=$'\033[1;31m'; yellow=$'\033[1;33m'; cyan=$'\033[1;36m'
green=$'\033[1;32m'; dim=$'\033[2m'; bold=$'\033[1m'; reset=$'\033[0m'

if [ -t 1 ]; then
  printf "%s" "$(tput clear 2>/dev/null || true)"
fi

cat <<BANNER

${red}    ╭──────────────────────────────────────────────╮${reset}
${red}    │${reset}                                                ${red}│${reset}
${red}    │${reset}      ${red}${bold}🦞  EXFOLIATE!  EXFOLIATE!  🦞${reset}            ${red}│${reset}
${red}    │${reset}                                                ${red}│${reset}
${red}    │${reset}      ${yellow}${bold}OpenClaw${reset} ${dim}— Right-Hand AI · 0G Compute${reset}  ${red}│${reset}
${red}    │${reset}      ${dim}Any OS. Any platform.${reset}                   ${red}│${reset}
${red}    │${reset}      ${dim}The lobster way 🦞${reset}                      ${red}│${reset}
${red}    │${reset}                                                ${red}│${reset}
${red}    ╰──────────────────────────────────────────────╯${reset}

BANNER

if [ ! -f .env ] && [ -z "${BOT_TOKEN:-}" ]; then
  printf "${red}✗ Missing .env file.${reset}\n"
  printf "  → ${cyan}cp .env.example .env${reset}\n"
  printf "  → fill in ${bold}BOT_TOKEN${reset} and ${bold}0G_PRIVATE_KEY${reset}\n"
  exit 1
fi

if [ ! -d node_modules ]; then
  printf "${dim}[ pre-flight ]${reset} ${cyan}▸${reset} fetching deps ${dim}(first run, ~30s)…${reset}\n"
  npm install --silent 2>&1 | tail -1
  printf "${dim}[ pre-flight ]${reset} ${green}✓${reset} deps installed\n\n"
fi

exec npm start

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# No build step: Node strips the TypeScript itself. See the README note "No build step".
PORT="${1:-3000}" exec node src/server.ts

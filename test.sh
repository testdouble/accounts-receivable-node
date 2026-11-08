#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# node_modules/.bin on PATH rather than `npx`, so the tools run from this project's
# lockfile and no other node manager's npx can intercept the call. See setup.sh.
PATH="$PWD/node_modules/.bin:$PATH"
# `vitest run`, not `vitest`: the bare command is watch mode, which hangs CI.
# "$@" passes a path through, e.g. ./test.sh tests/line-items.test.ts
exec vitest run "$@"

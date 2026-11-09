#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PATH="$PWD/node_modules/.bin:$PATH"

echo "==> tsc --noEmit"
# The only thing that type-checks. Nothing in this project compiles.
tsc --noEmit

echo "==> oxlint --type-aware"
# --type-aware pulls in the rules that need type information, including
# prefer-nullish-coalescing, which is the rule that guards this app's core invariant.
oxlint --type-aware

echo "==> prettier --check"
prettier --check .

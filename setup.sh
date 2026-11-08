#!/usr/bin/env bash
# One-shot bootstrap. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

EXPECTED="$(awk '/^nodejs /{print $2}' .tool-versions)"

echo "==> Installing Node $EXPECTED via asdf"
asdf install
# asdf 0.18 wants the version explicitly; `asdf reshim nodejs` on its own is a usage error.
asdf reshim nodejs "$EXPECTED"

ACTUAL="$(node --version)"
if [ "$ACTUAL" != "v$EXPECTED" ]; then
  echo "ERROR: node is $ACTUAL but .tool-versions says $EXPECTED." >&2
  echo "       Another node manager is most likely shadowing the asdf shim." >&2
  echo "       Check: type -a node" >&2
  exit 1
fi
echo "    Node $ACTUAL confirmed"

# npm is resolved from the asdf install rather than from PATH, on purpose.
#
# asdf-nodejs ships its own `npm` wrapper, and that wrapper finds npm by searching PATH
# with the asdf shims removed. If any other node manager (nodenv, nvm, fnm, Volta,
# Homebrew) is also on PATH, its npm wins -- so `npm` can be a different major, from a
# different Node, than the `node` two lines above. Addressing the binary directly is the
# only way to be sure the npm running here is the one this Node shipped with.
NPM="$(asdf where nodejs)/bin/npm"
echo "    npm $("$NPM" --version) (from $(asdf where nodejs)/bin)"

echo "==> Installing dependencies"
# `npm ci`, not `npm install`: it installs package-lock.json exactly and fails loudly if
# the lockfile and package.json disagree, rather than quietly resolving something new.
"$NPM" ci

echo "==> Applying migrations"
node src/db/migrate.ts

echo
echo "Done. Start the server with ./run.sh and run the tests with ./test.sh"
echo "Load development seed data (optional, safe to re-run) with: node src/seed.ts"

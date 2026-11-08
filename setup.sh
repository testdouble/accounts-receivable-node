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
#
# --ignore-scripts because nothing here needs a postinstall, and one package is actively
# harmed by it. better-sqlite3 ships Node-API prebuilds for all eight platforms inside
# its own tarball, but it also ships the binding.gyp it would need to build from source,
# and npm reacts to that file by running `node-gyp rebuild` -- which wants Python and a
# C++ toolchain this project otherwise has no use for, and fails the install outright
# when they are missing. Skipping scripts uses the prebuild, which is the binary a source
# build would have produced. esbuild, the only other package with a postinstall, resolves
# its platform binary through optionalDependencies and does not need one either.
"$NPM" ci --ignore-scripts

echo "==> Applying migrations"
node src/db/migrate.ts

echo
echo "Done. Start the server with ./run.sh and run the tests with ./test.sh"
echo "Load development seed data (optional, safe to re-run) with: node src/seed.ts"

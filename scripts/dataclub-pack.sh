#!/usr/bin/env bash
# DataClub fork only — packs @data-club/letta-code.
#
# package.json stays byte-identical to upstream (@letta-ai/letta-code), so upstream
# release syncs never conflict on the name/version lines. The fork's npm identity
# (name, description, publishConfig.access=restricted) is applied here, BEFORE the
# build (build.js bundles package.json into letta.js), and package.json is restored
# from git afterwards, even on failure.
#
# Usage (after `bun install --frozen-lockfile`):
#   scripts/dataclub-pack.sh <pack-destination-dir>
#   npm publish <pack-destination-dir>/data-club-letta-code-<version>.tgz --tag latest
# Always publish the TARBALL, never the directory (prepublishOnly would rebuild), and
# never pass --access public (npm applies --access to existing packages).
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <pack-destination-dir>" >&2
  exit 2
fi
mkdir -p "$1"
DEST="$(cd "$1" && pwd)"
cd "$(dirname "$0")/.."

if ! git diff --quiet HEAD -- package.json; then
  echo "package.json has uncommitted changes; refusing to pack" >&2
  exit 1
fi
trap 'git checkout HEAD -- package.json' EXIT

npm pkg set \
  name=@data-club/letta-code \
  "description=DataClub fork of Letta Code — CLI tool for interacting with stateful Letta agents from the terminal." \
  publishConfig.access=restricted

bun run build

TGZ="$DEST/$(npm pack --ignore-scripts --pack-destination "$DEST" | tail -n 1)"

# Identity check: never hand out a tarball that could publish public or under upstream's name.
tar -xOzf "$TGZ" package/package.json | node -e '
  const p = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (p.name !== "@data-club/letta-code" || p.publishConfig?.access !== "restricted") {
    console.error(`identity check FAILED: name=${p.name} access=${p.publishConfig?.access}`);
    process.exit(1);
  }
  console.error(`identity ok: ${p.name}@${p.version} access=${p.publishConfig.access}`);
' || { rm -f "$TGZ"; exit 1; }
echo "$TGZ"

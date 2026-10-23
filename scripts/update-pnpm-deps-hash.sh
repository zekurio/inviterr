#!/usr/bin/env bash
# Refresh the pnpm dependency hash in flake.nix after pnpm-lock.yaml changed.
#
# The dependency derivation is fixed-output, so Nix only reports the correct
# hash when the recorded one is wrong. Swap in a placeholder, build, and write
# back the hash Nix prints. One hash covers every supported system because the
# fetcher downloads all platforms' optional dependencies.
set -euo pipefail

repo=$(cd -- "$(dirname -- "$0")/.." && pwd)
flake="$repo/flake.nix"
placeholder="sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

current=$(sed -n -E 's/^[[:space:]]*pnpmDepsHash \? "([^"]*)",?[[:space:]]*$/\1/p' "$flake")
if [[ -z "$current" ]]; then
  echo "Could not find pnpmDepsHash in $flake" >&2
  exit 1
fi

restore() {
  sed -i "s|$placeholder|$current|" "$flake"
}

sed -i "s|$current|$placeholder|" "$flake"
trap restore EXIT

output=$(nix build --no-link "$repo#inviterr.pnpmDeps" 2>&1 || true)
got=$(printf '%s\n' "$output" | sed -n -E 's/^[[:space:]]*got:[[:space:]]+(sha256-[A-Za-z0-9+/=]+)[[:space:]]*$/\1/p' | head -n 1)

if [[ -z "$got" ]]; then
  printf '%s\n' "$output" >&2
  echo "Nix did not report a dependency hash; see the output above." >&2
  exit 1
fi

trap - EXIT
sed -i "s|$placeholder|$got|" "$flake"

if [[ "$got" == "$current" ]]; then
  echo "pnpm dependency hash is up to date: $got"
else
  echo "Updated pnpm dependency hash: $current -> $got"
fi

#!/usr/bin/env bash
# Proves third_party/go-graphviz is exactly upstream with dossier.patch
# applied, so nobody edits the vendored copy by hand.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
core=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
"$here/vendor.sh" "$tmp/go-graphviz" >/dev/null
if ! diff -r "$tmp/go-graphviz" "$core/third_party/go-graphviz"; then
  echo "third_party/go-graphviz differs from upstream plus scripts/graphviz/dossier.patch; change the patch and run scripts/graphviz/vendor.sh" >&2
  exit 1
fi

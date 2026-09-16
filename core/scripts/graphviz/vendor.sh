#!/usr/bin/env bash
# Vendors github.com/goccy/go-graphviz into third_party/go-graphviz with
# Dossier's patch applied. Upstream compiles and starts its wasm module in
# package init functions, so every command paid for Graphviz even when a
# document had no diagram; the patch loads it on first use, keeps the compile
# cache in the user cache directory, and drops the PNG and JPEG renderers and
# the font and image libraries they need. Run it after changing the version
# or the patch, then run make check. With a directory argument it writes
# there instead, which is how make check proves third_party matches.
set -euo pipefail
version=v0.2.10
here=$(cd "$(dirname "$0")" && pwd)
core=$(cd "$here/../.." && pwd)
src=$(go mod download -json "github.com/goccy/go-graphviz@$version" | sed -n 's/^[[:space:]]*"Dir": "\(.*\)",$/\1/p')
dest="${1:-$core/third_party/go-graphviz}"
files=(LICENSE README.md go.mod alias.go graphviz.go option.go graphviz.version cdt cgraph gvc internal/wasm/bind.go internal/wasm/ext.go internal/wasm/graphviz.wasm)
rm -rf "$dest"
mkdir -p "$dest"
(cd "$src" && tar cf - "${files[@]}") | (cd "$dest" && tar xf -)
chmod -R u+w "$dest"
rm "$dest/gvc/image_renderer.go"
patch --quiet -p1 -d "$dest" < "$here/dossier.patch"
echo "vendored go-graphviz $version into $dest"

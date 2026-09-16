#!/bin/sh
# Fails when generated output (templ, sqlc, SKILL.md, the React package's
# model types) is stale against its source.
# It snapshots the generated files, regenerates, and compares contents, so it
# works on an uncommitted tree; commit the regenerated files with the change.
set -eu

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM

generated_files() {
  find internal -type f -name '*_templ.go' -print
  find internal/store/db -type f -name '*.go' -print 2>/dev/null || true
  echo skill/SKILL.md
  echo ../packages/react/src/model.ts
}

generated_files | LC_ALL=C sort > "$tmp/before-files"
while IFS= read -r file; do
  if [ -f "$file" ]; then
    mkdir -p "$tmp/files/$(dirname "$file")"
    cp "$file" "$tmp/files/$file"
  fi
done < "$tmp/before-files"

make -s generate >/dev/null

generated_files | LC_ALL=C sort > "$tmp/after-files"
if ! diff -u "$tmp/before-files" "$tmp/after-files"; then
  echo "generated file inventory changed; run make generate and commit the result" >&2
  exit 1
fi

stale=0
while IFS= read -r file; do
  if ! cmp -s "$tmp/files/$file" "$file"; then
    echo "generated file is stale: $file (run make generate)" >&2
    stale=1
  fi
done < "$tmp/after-files"
test "$stale" -eq 0

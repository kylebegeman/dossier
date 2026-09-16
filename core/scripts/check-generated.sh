#!/bin/sh
# Fails when committed generated output (templ, SKILL.md) drifts from its source.
set -e
go tool templ generate >/dev/null
go run ./cmd/dossier skill --write skill/SKILL.md >/dev/null
if [ -n "$(git status --porcelain -- '*_templ.go' skill/SKILL.md 2>/dev/null)" ]; then
  echo "generated output is stale; run make generate and commit" >&2
  git status --porcelain -- '*_templ.go' skill/SKILL.md >&2
  exit 1
fi

#!/bin/sh
# Fails when committed generated templ output drifts from its source.
set -e
go tool templ generate >/dev/null
if [ -n "$(git status --porcelain -- '*_templ.go' 2>/dev/null)" ]; then
  echo "generated templ output is stale; run make generate and commit" >&2
  git status --porcelain -- '*_templ.go' >&2
  exit 1
fi

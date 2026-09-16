# @kylebegeman/dossier

The `dossier` binary for Node projects. Dossier turns one JSON model into one
self-contained HTML artifact a reader scans once, picks from by number, and
hands back as decisions.

```sh
npm install --save-dev @kylebegeman/dossier
npx dossier init brainstorm --title "Onboarding ideas"
npx dossier build onboarding-ideas.dossier.json
```

npm installs the prebuilt binary for your platform as an optional dependency:
macOS and Linux on arm64 and x64, and Windows on arm64 and x64. Elsewhere, build
from source with Go and set `DOSSIER_BIN`.

`require("@kylebegeman/dossier").binaryPath()` returns the binary's path for
tools that run it themselves. For React, see `@kylebegeman/dossier-react`.

Run `npx dossier describe` for every command, or `npx dossier skill` for the
agent skill.

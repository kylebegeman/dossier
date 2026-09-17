# @kylebegeman/dossier

The `dossier` binary for Node projects. Dossier turns one JSON model into one
self-contained HTML page that a person reads once and decides on by number,
and it hands those decisions back to your agent as one line.

<img alt="A Dossier page titled Ten changes for a steadier booking service" src="https://raw.githubusercontent.com/kylebegeman/dossier/v0.7.1/docs/assets/readme/hero-light.webp">

**[Open the live examples](https://kylebegeman.github.io/dossier/)**, one for every kind.

```sh
npm install --save-dev @kylebegeman/dossier
npx dossier init brainstorm --title "Onboarding ideas"
npx dossier build onboarding-ideas.dossier.json
```

npm installs the prebuilt binary for your platform as an optional dependency:
macOS and Linux on arm64 and x64, and Windows on arm64 and x64. Elsewhere, build
from source with Go and set `DOSSIER_BIN`.

`require("@kylebegeman/dossier").binaryPath()` returns the binary's path for
tools that run it themselves. For React, see
[`@kylebegeman/dossier-react`](https://www.npmjs.com/package/@kylebegeman/dossier-react).

Run `npx dossier describe` for every command, or `npx dossier skill` for the
agent skill. The [README](https://github.com/kylebegeman/dossier#readme) shows
the rest.

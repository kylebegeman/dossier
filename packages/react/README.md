# @kylebegeman/dossier-react

A typed React wrapper around the artifact Dossier renders. Dossier turns one
JSON model into one self-contained HTML file; this package renders that model
on the server with the `dossier` binary and shows the artifact in an isolated
frame that sizes itself and reports the reader's picks.

```sh
npm install @kylebegeman/dossier-react @kylebegeman/dossier
```

`@kylebegeman/dossier` ships the binary. Without it, set `DOSSIER_BIN` or put
`dossier` on your PATH.

## Render on the server, show on the client

```tsx
// app/moves/page.tsx (a server component)
import { renderDossier } from "@kylebegeman/dossier-react/server";
import type { DossierModel } from "@kylebegeman/dossier-react";
import { Moves } from "./moves";
import model from "./moves.dossier.json";

export default async function Page() {
  const { html } = await renderDossier(model as DossierModel);
  return <Moves html={html} />;
}
```

```tsx
// app/moves/moves.tsx
"use client";
import { DossierFrame } from "@kylebegeman/dossier-react";

export function Moves({ html }: { html: string }) {
  return <DossierFrame html={html} title="Moves" onDecisions={(d) => console.log(d.reply)} />;
}
```

## API

| Export | What it does |
| --- | --- |
| `renderDossier(model, options)` from `/server` | Runs `dossier render` and resolves `{ html, slug, warnings }`. A model with findings rejects with a `DossierRenderError` carrying them. |
| `DossierFrame` | Shows the HTML in a sandboxed frame that grows to the page's height. `onDecisions` receives `{ path, picked, notes, reply }` on load and on every change. |
| `DEFAULT_SANDBOX` | The frame's sandbox. Its origin is opaque, so picks last for the session; add `allow-same-origin` for trusted artifacts whose picks should persist. |
| `readerMessage(data)` | Validates a message the reader posts, for hosts that frame artifacts themselves. |
| `DossierModel`, `DossierResult`, and the rest | Types generated from Dossier's JSON Schemas. |

The artifact makes no external requests, so the frame needs no network
permissions.

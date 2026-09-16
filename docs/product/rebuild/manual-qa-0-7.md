---
title: "Dossier 0.7 manual QA"
slug: "manual-qa-0-7"
status: "current"
updated: "2026-09-16"
---

# Dossier 0.7 manual QA

The checks a person runs before a 0.7 release, beyond `make check` and
`make dist-check`. Each step names what to look for. Run them against a build
from `core/` (`make build`, then `core/bin/dossier`).

## 1. The artifact

Build the reference document and open it in a browser.

```sh
dossier build core/examples/dossier-0-7-brainstorm.dossier.json --out /tmp/qa
```

- **No requests.** The network panel shows the one HTML document and nothing
  else.
- **Theme.** The toggle cycles Auto, Light, Dark. A reload keeps the choice.
  Auto follows the system setting in both directions.
- **Items.** Items start collapsed. Expand all and Collapse all work. An
  opened item stays open after a reload.
- **Picks.** Pick works from an item head and from the summary table's
  checkbox, and the contents rail marks picked items. The masthead count
  follows.
- **Hide picked.** It hides picked items and shows a row with their count and
  a Show picked button.
- **Notes.** Add a note, reload, and the note is still there.
- **Reply.** Copy reply puts a line such as `1, 3. Notes: 3: keep blue.` on the
  clipboard. Copy decisions as JSON copies a `dossier.decisions/v1` document.
- **Print.** Print preview expands every item and hides the controls.
- **Narrow.** At phone width the contents rail becomes a row of chips and
  nothing scrolls sideways except tables.

## 2. The decisions loop

```sh
cp core/examples/dossier-0-7-brainstorm.dossier.json /tmp/qa/model.dossier.json
dossier decisions apply /tmp/qa/model.dossier.json --reply "2, 5. Notes: 5: smaller first"
dossier build /tmp/qa/model.dossier.json --out /tmp/qa
dossier decisions read /tmp/qa/model.dossier.json
```

After the rebuild, items 2 and 5 open
picked with the note in place, and `decisions read` prints the same reply.

## 3. 0.6 documents

```sh
dossier validate core/testdata/legacy/showcase.dossier.json
dossier build core/testdata/legacy/showcase.dossier.json --out /tmp/qa
cp core/testdata/legacy/showcase.dossier.json /tmp/qa/copy-of-showcase.dossier.json
dossier upgrade /tmp/qa/copy-of-showcase.dossier.json
```

- Validate and build succeed with one deprecation warning per aliased block.
- The page shows charts, a figure, diagram source, and highlighted code.
- After `upgrade` on a copy, `validate` shows no 0.6 warnings.

## 4. The studio

```sh
dossier serve /tmp/qa/model.dossier.json --open
```

- **Live.** The bar at the bottom says Live. Edit the model file in an editor
  and the page reloads within a second.
- **Edit.** Turn on Edit, click a section title, change it, press Enter. The
  page reloads with the draft outlined and the bar offers Save 1 draft. The
  model file is unchanged.
- **Markdown.** Click a facet body, edit, press Cmd or Ctrl+Enter.
- **Refusal.** Clear an item title and save. The editor shows the finding and
  keeps the draft out.
- **Reorder.** In edit mode, move an item down. Its number changes and the
  Summary heading shows reordered.
- **Save and discard.** Save writes every draft to the file and the bar says
  No drafts. Discard asks first and leaves the file alone.
- **Conflict.** Draft a title, then change the same title in the file. Save
  keeps the file's title and reports one conflict.
- **Two tabs.** Pick in one tab and the other reloads with the pick. Write
  decisions puts the picks into the model file.
- **Model JSON.** Validate reports Valid. Break the kind and Save refuses with
  the finding. Close without saving.
- **Accent.** Change the accent. The page recolors, and the color survives a
  restart of serve. Reset returns to crimson.
- **0.6 file.** Serve a legacy fixture copy. Edit is disabled and the bar
  says to upgrade.
- **Stop.** Ctrl+C prints `studio stopped` within a few seconds, with the tab
  still open.

## 5. MCP

```sh
claude mcp add dossier-qa -- dossier mcp
```

In a Claude Code session, the tools list shows `describe`, `init`, `validate`,
`build`, `upgrade`, `decisions_read`, and `decisions_apply`. Ask the agent to
start a brainstorm with `init`, fill it, and `build` it. Remove the server
afterwards with `claude mcp remove dossier-qa`.

## 6. React

In a Next.js app with `@kylebegeman/dossier-react` installed from a local
pack, render a model on the server with `renderDossier` and show it with
`DossierFrame`. The frame grows to the page, a pick logs through
`onDecisions`, and links open in a new tab.

## 7. Distribution

```sh
cd core && make dist-check
```

All five checks print ok. Read `dist/homebrew/dossier.rb` once: every URL
names `v` plus the version, and every checksum matches `dist/checksums.txt`.

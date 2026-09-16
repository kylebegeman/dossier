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

## 1. The showcase

Build all seven example documents, with their Markdown, and open each page in
a browser.

```sh
dossier build core/examples/*.dossier.json --md --out /tmp/qa
```

| Page | Kind | Look for |
| --- | --- | --- |
| `winter-crossing.html` | brainstorm | The route figure, the contacts chart, picks, and the storm days or quiet midweeks choice |
| `spring-fixes.html` | brainstorm | Picks alone, with no choice |
| `offline-boarding-passes.html` | plan | Three phase boards, the diagram, go, revise, and skip, and a Diff facet |
| `tide-aware-cancellations.html` | review | Severity groups, fix, later, and skip, approve or rework, and Checked rows |
| `release-3-4-0.html` | release | Verdicts only on failed and pending gates, ship or hold, and the guard warning |
| `car-deck-double-booking.html` | incident | Severity facts, the timeline, factor rows, and follow-ups by detect, mitigate, and prevent |
| `checkout-abandonment.html` | brief | A blue accent, findings by confidence, a figure, and no decision block |

On every page:

- **No requests.** The network panel shows the one HTML document and nothing
  else.
- **Theme.** The toggle cycles Auto, Light, Dark, and a reload keeps the
  choice. Charts, diagrams, chips, and the accent read well in both themes.
- **Contents.** The rail groups items by the kind's field, or by phase in the
  plan, where each phase heading links to its section. Frame and Rest appear
  once each.
- **Items.** Items start collapsed. Expand all and Collapse all work, and an
  opened item stays open after a reload.
- **Search.** `/` focuses search. Terms match titles, summaries, facets, rows,
  and section text, and a number matches its item. Enter and Shift+Enter step
  through hits, items open for a hit, and Esc clears the search and closes
  them again.
- **Print.** Print preview expands every item and hides the controls.
- **Narrow.** At phone width the rail becomes a row of chips and nothing
  scrolls sideways except tables, code, and wide diagrams, each in its own
  frame.

## 2. Deciding

- **Picks.** In a brainstorm, Pick works from an item head and from the
  summary checkbox, and the rail and the masthead count follow.
- **Verdicts.** In the plan, review, release, and incident pages, click a
  verdict: it selects without opening the item. Arrow keys move and select
  within the group, and Delete clears it. The summary menu, the rail marker,
  and the masthead count follow.
- **Choice.** Choosing an option updates the masthead fact, and Clear the
  choice returns it to Open.
- **Guard.** In the release, choose Ship. A warning names gate 1, the failed
  required gate. Waive gate 1 and the warning goes.
- **Hide decided.** It hides decided items and the rows and rail entries
  that match them, together with any search.
- **Notes.** Add a note, reload, and the note is still there.
- **Reply.** The reply line updates as you decide. Copy reply puts it on the
  clipboard, and Copy decisions as JSON copies a `dossier.decisions/v1`
  document. The example reply under each decision block names items that
  page can take.

## 3. The decisions loop

```sh
cp core/examples/tide-aware-cancellations.dossier.json /tmp/qa/review.dossier.json
dossier decisions apply /tmp/qa/review.dossier.json --reply "rework, 1-3; later 4, 5; skip 6. Notes: 4: after the release."
dossier build /tmp/qa/review.dossier.json --out /tmp/qa
dossier decisions read /tmp/qa/review.dossier.json
```

After the rebuild the page opens with rework chosen and each verdict in
place, and `decisions read` prints
`rework, fix 1, 2, 3; later 4, 5; skip 6. Notes: 4: after the release.`
A reply the kind cannot read, such as `waive 1` here, fails with a message
that names the words it accepts.

## 4. Markdown

Open `/tmp/qa/release-3-4-0.md` in a Markdown preview. It carries the
masthead facts, the changes table, the chart as a table, the gates summary,
every gate with its facets, the rollback steps, and the decision block with a
working example reply.

## 5. Custom kinds

```sh
dossier --kinds core/examples/kinds describe
dossier --kinds core/examples/kinds init retro --title "Sprint 14 retro" --out /tmp/qa
dossier --kinds core/examples/kinds build /tmp/qa/sprint-14-retro.dossier.json --out /tmp/qa
```

`describe` lists `retro` with its source path, and the starter builds. Break
the kind file, for example by giving a facet an unknown tone, and every
command answers with a finding that names the kind file.

## 6. 0.6 documents

```sh
dossier validate core/testdata/legacy/release-0-6-7.dossier.json
cp core/testdata/legacy/release-0-6-7.dossier.json /tmp/qa/old-release.dossier.json
dossier upgrade /tmp/qa/old-release.dossier.json
dossier build /tmp/qa/old-release.dossier.json --out /tmp/qa
```

- Validate succeeds with one deprecation warning per aliased block.
- The upgraded model validates with no 0.6 warnings. Its gates carry status
  and Required, the stat strip became masthead facts, and command flags such
  as `--dry-run` read as typed.

## 7. The studio

```sh
cp core/examples/release-3-4-0.dossier.json /tmp/qa/studio.dossier.json
dossier serve /tmp/qa/studio.dossier.json --open
```

- **Live.** The bar at the bottom says Live. Edit the model file in an editor
  and the page reloads within a second.
- **Edit.** Turn on Edit, click a section title, change it, press Enter. The
  page reloads with the draft outlined and the bar offers Save 1 draft. The
  model file is unchanged.
- **Markdown.** Click a facet body, edit, press Cmd or Ctrl+Enter.
- **Facets.** Remove an optional facet, and add one from the menu, which
  offers only the kind's facets that are missing, with their hints. A
  required facet has no remove control.
- **Refusal.** Clear an item title and save. The editor shows the finding and
  keeps the draft out.
- **Reorder.** In edit mode, move an item down. Its number changes and the
  section heading shows reordered.
- **Save and discard.** Save writes every draft to the file and the bar says
  No drafts. Discard asks first and leaves the file alone.
- **Conflict.** Draft a title, then change the same title in the file. Save
  keeps the file's title and reports one conflict.
- **Two tabs.** Choose Hold and waive a gate in one tab, and the other tab
  reloads with both. Write decisions puts them into the model file.
- **Import.** Import reply accepts `ship, waive 1; rerun 2, 3.` and the page
  shows it. A reply naming a passed gate is refused with the reason.
- **Model JSON.** The editor highlights JSON and marks a syntax error as you
  type. Break the kind and Save refuses, with the finding marked at its
  place. Close without saving.
- **Accent.** Change the accent. The page recolors in both themes with the
  palette a built page would use, and the color survives a restart of serve.
  Keep in model drafts it into `meta.theme.accent`, and Reset returns to
  crimson.
- **0.6 file.** Serve a legacy fixture copy. Edit is disabled and the bar
  says to upgrade.
- **Stop.** Ctrl+C prints `studio stopped` within a few seconds, with the tab
  still open.

## 8. MCP

```sh
claude mcp add dossier-qa -- dossier mcp
```

In a Claude Code session, the tools list shows `describe`, `init`, `validate`,
`build`, `upgrade`, `decisions_read`, and `decisions_apply`. Ask the agent to
start a review with `init`, fill it, and `build` it. Remove the server
afterwards with `claude mcp remove dossier-qa`.

## 9. React

In a Next.js app with `@kylebegeman/dossier-react` installed from a local
pack, render the review example on the server with `renderDossier` and show
it with `DossierFrame`. The frame grows to the page, a verdict logs through
`onDecisions` with its `verdicts`, and links open in a new tab.

## 10. Distribution

```sh
cd core && make dist-check
```

All checks print ok. Read `dist/homebrew/dossier.rb` once: every URL names
`v` plus the version, and every checksum matches `dist/checksums.txt`. Each
archive carries `THIRD_PARTY_NOTICES.md`.

# Reader design

Every dossier uses one document renderer, including custom kinds, the React
frame, and the document inside the studio.

## Visual language

Neutral gray surfaces carry the reading in both themes: a light gray page with
white paper in light mode, a near-black page with charcoal paper in dark mode.
Every color token is a `light-dark()` pair, so one stylesheet serves both
themes, and `color-scheme` on the root selects the palette: the system
preference by default, or the theme the reader chose. Do not introduce a warm
or cool cast into the page, reading surfaces, borders, or body text.

Color has three jobs. The kind names the document: violet for brainstorms,
blue for plans and briefs, amber for reviews, teal for releases, and coral for
incidents. The kind color appears on the kind badge, the masthead kicker, section and
item numbers, the active chapter in the outline, and timeline times. Tones name status and
evidence on chips, counts, and diagram nodes. State names a decision: a picked
item, a verdict, or a chosen option turns its number, its row in the
comparison table, and its dot in the rail the same color. Violet identifies
primary actions and links; `meta.theme.accent` can replace it and wins over
the token pairs in both themes.

Never use decorative accent lines. Navigation, items, callouts, and headings
must not have colored edge stripes. Selection uses a flat fill and text
weight. Keyboard focus uses a complete, visible outline.

Highlighted code uses the same tokens: keywords in violet, strings in teal,
numbers and constants in amber, names in blue, comments and punctuation
muted, and diff lines on the teal and risk fills. The palette is the
stylesheet's `.hl-` rules, so it follows the theme like everything else.

## Layout

The page has a glass toolbar, a masthead that spans the page, a reading
column, and a sticky rail. The toolbar carries the wordmark, the kind badge,
search with a `/` hint and a match count, and a two-state theme switch. The
masthead holds the eyebrow, the title, the introduction, and unboxed facts.
Below it, a reading line names what follows, such as "4 sections, 10 ideas",
beside the Hide decided and Expand all controls.

Sections sit on a number axis: a narrow column on the left carries the
section number in the kind color, and the reading column beside it holds the
prose. Items span both columns and repeat the axis for their own number, so
numbers line up down the page. Items read as a list divided by hairlines.
The hairlines, the hover fill on an item's title row, and the paper card of
the open item all share the section's outer edges; the row's content is
inset from those edges by `--inset`, and the section number carries the
same inset so the number axis stays aligned. The open item lifts onto
paper with a shadow ring. Native controls are restyled: the verdict select
in a comparison table draws its own chevron with room beside it. Boards lead with their items,
and a separate disclosure opens the comparison table. Each item has a stable
number, title, summary, metadata, and inline decision controls. Supporting
facets stay behind the item fold.

The rail lists the sections first, with a disclosure for the complete item
index, and then the decision panel: the running count, the document choice, a
dot map of every numbered decision that links to its item and takes the state
color once decided, a Next undecided button in verdict kinds, Copy reply once
something is decided, and a link to the finished reply, which closes the
document.

At compact widths the rail collapses above the reading column as a Contents
button and a decisions disclosure, and the toolbar wraps the search onto its
own line. The navigation remains available without JavaScript.

Print uses the light palette on white, hides the controls, keeps only the
chosen options, opens items, comparison tables, row details, and the decision
panel, wraps code, and restores the reader's state afterward.

Titles use one sans-serif treatment. Legacy `meta.emphasis` is accepted but
has no visual effect. The renderer does not convert literal dashes into
punctuation. The authoring skill asks for direct copy without decorative
italics or em dashes. Authored prose and code remain intact.

The theme control has two states, light and dark. On first load, use the
system preference, falling back to light. An explicit choice is remembered
across documents on the same origin. Existing per-document preferences still
work, and legacy `auto` values resolve to the system preference. Inferring a
system theme does not save an explicit preference. Without JavaScript, the
stylesheet follows the system and the control stays hidden.

`make site` also copies `docs/site/explore.html` into the generated site. The
example browser switches between the six built-in kinds with tabs and the
number keys, previews each at desktop, tablet, and phone widths in a device
frame, keeps its own theme button in step with the embedded reader, and opens
the document on its own. The embedded pages are the same standalone artifacts.

## Implementation

- `core/internal/render/document.templ` owns the shared layout.
- `core/internal/render/assets/tokens.css` owns the token pairs, the kind,
  tone, and state colors, components, responsive behavior, keyboard focus,
  reduced motion, and print styling.
- `core/internal/render/assets/reader.js` owns navigation, search, theme,
  decisions, the dot map, Next undecided, persistence, and print restoration.
- `core/internal/theme` derives custom accents against the strongest surface
  in each theme and emits them as plain values under explicit theme selectors,
  which override the token pairs. Update its surface references when changing
  surface tokens. Print uses the light palette even when the reader chose dark
  mode.

Artifacts remain self-contained. Web fonts are opt-in. The budgets are
32 KiB for styles, 20 KiB for the reader, and 120 KiB per showcase page.

## Verification

`make check` covers generated output, static analysis, race tests, and the
CGO-free build. Renderer tests parse the token pairs and check text contrast
and grayscale surfaces in both palettes, literal dashes, and output contracts.
Showcase goldens cover all built-in kinds. The React package's `npm test`
checks rendering, frame messages, theme selection, and reply grammar.

For visual changes, inspect both themes, custom accents, item details,
choices, warnings, comparison tables, the dot map, Next undecided, print, the
example browser, and studio editing. Check 320, 390, 768, 1000, and 1280 pixel
widths, including search, empty results, expansion, keyboard verdicts, and
notes.

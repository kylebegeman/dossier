# Reader design

Every dossier uses one document renderer, including custom kinds, the React
frame, and the document inside the studio.

## Visual language

Use neutral grayscale surfaces in both themes: white and gray in light mode,
charcoal and gray in dark mode. Violet identifies primary actions and links;
`meta.theme.accent` can replace it. Each kind has a compact icon and color:
violet for brainstorms, blue for plans and briefs, amber for reviews, green
for releases, and coral for incidents. Use these on the kind badge and section
and item numbers. Semantic colors distinguish counts, status, evidence, and
selected decisions. Do not introduce a warm or cool cast into the page,
reading surfaces, borders, or body text.

Never use decorative accent lines. Navigation, items, callouts, and headings
must not have colored edge stripes. Selection uses a flat fill and
text weight. Keyboard focus uses a complete, visible outline.

The opening spans the page, with a title, introduction, and unboxed facts.
The reading column sits beside a compact section outline and a decision panel.
The outline lists sections first; a disclosure holds the complete item index.
Document choices are available beside the content instead of only at its end.
At compact widths, contents and decisions collapse above the reading column.
The navigation remains available without JavaScript.

Boards lead with their items. A separate disclosure opens the comparison
table. Each item has a prominent stable number, title, summary, metadata, and
inline decision controls. Supporting facets stay behind the item fold. The
finished reply closes the document. Print opens items, comparison tables,
row details, and the decision panel, then restores their state afterward.

Titles use one sans-serif treatment. Legacy `meta.emphasis` is accepted but
has no visual effect. The renderer does not convert literal dashes into
punctuation. The authoring skill asks for direct copy without decorative
italics or em dashes. Authored prose and code remain intact.

The theme control has two states, light and dark. On first load, use the
system preference, falling back to light. An explicit choice is remembered
across documents on the same origin. Existing per-document preferences still
work, and legacy `auto` values resolve to the system preference. Inferring a
system theme does not save an explicit preference. Without JavaScript, the
stylesheet follows the system and the inactive control stays hidden.

`make site` also copies `docs/site/explore.html` into the generated site. This
example browser switches between all six built-in kinds and offers a mobile
width view. The embedded pages are the same standalone artifacts.

## Implementation

- `core/internal/render/document.templ` owns the shared layout.
- `core/internal/render/assets/tokens.css` owns themes, components, responsive
  behavior, keyboard focus, reduced motion, and print styling.
- `core/internal/render/assets/reader.js` owns navigation, search, decisions,
  persistence, and print restoration.
- `core/internal/theme` derives custom accents against the strongest surface
  in each theme. Update those references when changing surface tokens. Print
  uses the light palette even when the reader chose dark mode.

Artifacts remain self-contained. Web fonts are opt-in. Existing budgets remain
30 KiB for styles, 20 KiB for the reader, and 120,000 bytes per showcase page.

## Verification

`make check` covers generated output, static analysis, race tests, and the
CGO-free build. Renderer tests check text contrast, grayscale surfaces, literal
dashes, and output contracts. Showcase goldens cover all built-in kinds. The
React package's `npm test` checks rendering, frame messages, theme selection,
and reply grammar.

For visual changes, inspect both themes, custom accents, item details, choices,
warnings, comparison tables, print, and studio editing. Check 320, 390, 768,
1000, and 1280 pixel widths, including search, empty results, expansion,
keyboard verdicts, and notes.

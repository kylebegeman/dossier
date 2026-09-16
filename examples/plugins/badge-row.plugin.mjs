// Example Dossier plugin, a custom `badge-row` block, with FULL PARITY across both
// renderers. A plugin's default export receives the authoring API and registers:
//   - registerBlock(type, fn)        → Node generator (and the static artifact)
//   - registerComponent(type, Comp)  → React port (native component; present in the React CLI)
// Register both for a block that renders natively everywhere.
//
//   dossier build my.dossier.json --plugin examples/plugins/badge-row.plugin.mjs
//   (or the React CLI: npx tsx react/src/cli.tsx my.dossier.json --plugin <this file>)
//
// Then in your model:  { "type": "badge-row", "badges": ["alpha", "v2", "internal"] }

export default function ({ registerBlock, registerComponent, esc, React }) {
  // Node / static string renderer
  registerBlock("badge-row", (b) => {
    const chips = (b.badges || []).map((x) => `<span class="ds-chip">${esc(x)}</span>`).join("");
    return `<section class="ds-block" data-block="badge-row" data-id="${esc(b.id || "")}"><div class="ds-chips">${chips}</div></section>`;
  });

  // Native React component (only available when loaded by the React CLI / app)
  if (registerComponent && React) {
    registerComponent("badge-row", ({ b }) =>
      React.createElement(
        "section",
        { className: "ds-block", "data-block": "badge-row", "data-id": b.id || undefined },
        React.createElement(
          "div",
          { className: "ds-chips" },
          (b.badges || []).map((x, i) => React.createElement("span", { className: "ds-chip", key: i }, x))
        )
      )
    );
  }
}

export default function ({ registerBlock, esc, inlineMd }) {
  registerBlock("signal-banner", (block, ctx = {}) => {
    const tone = esc(block.tone || "info");
    const title = esc(block.title || "Signal");
    const body = block.body ? `<p>${inlineMd(block.body, ctx)}</p>` : "";
    const items = (block.items || [])
      .map((item) => `<span class="ds-chip">${esc(item)}</span>`)
      .join("");
    return (
      `<section class="ds-block ds-callout tone-${tone}" data-block="signal-banner">` +
      `<h3>${title}</h3>${body}${items ? `<div class="ds-chips">${items}</div>` : ""}</section>`
    );
  });
}

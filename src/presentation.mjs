import { THEMES } from "./themes.mjs";
import { SKINS, skinNames } from "./skins.mjs";

function supported(names) {
  return names.length ? names.join(", ") : "none";
}

export function applyPresentationOptions(model, opts = {}) {
  const meta = { ...(model.meta || {}) };

  if (opts.theme) {
    if (!THEMES[opts.theme]) {
      throw new Error(`unknown theme: ${opts.theme} (supported: ${supported(Object.keys(THEMES))})`);
    }
    // A document's own meta.theme always wins over the named pack.
    meta.theme = { ...THEMES[opts.theme], ...(meta.theme || {}) };
  }

  if (opts.skin) {
    if (!SKINS[opts.skin]) {
      throw new Error(`unknown skin: ${opts.skin} (supported: ${supported(skinNames())})`);
    }
    meta.skin = opts.skin;
  }

  model.meta = meta;
  return model;
}

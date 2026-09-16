// Built-in brand packs. Each is a set of token overrides (token name without the
// `--ds-` prefix). Apply at build with `--theme <name>`, or live in the Theme Studio.
// meta.theme on a document always wins over a pack.

export const THEMES = {
  default: {},
  berry: { accent: "#c81e4a", "accent-2": "#a8183d", "accent-tint": "rgba(200,30,74,.08)" },
  slate: { accent: "#4f5b6b", "accent-2": "#3a4452", "accent-tint": "rgba(79,91,107,.1)" },
  forest: { accent: "#2f7d55", "accent-2": "#246342", "accent-tint": "rgba(47,125,85,.1)" },
  ocean: { accent: "#1f7a98", "accent-2": "#185f76", "accent-tint": "rgba(31,122,152,.1)" },
  midnight: { accent: "#5b6ef5", "accent-2": "#4654d4", "accent-tint": "rgba(91,110,245,.12)" },
  amber: { accent: "#c2790c", "accent-2": "#a06409", "accent-tint": "rgba(194,121,12,.12)" },
  plum: { accent: "#8a3ffc", "accent-2": "#722fd1", "accent-tint": "rgba(138,63,252,.1)" },
};

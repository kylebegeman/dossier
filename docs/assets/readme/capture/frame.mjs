// Frames a raw capture in a quiet browser window with a transparent
// surround, so the images sit well on GitHub's light and dark themes.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { images, rect } from "./cdp.mjs";

const palette = {
  light: { bar: "#f5f3f6", edge: "rgba(32,28,34,0.13)", dot: "#dcd6df", muted: "#766e7c", pill: "#ebe7ed", shadow: "rgba(24,18,30,0.16)" },
  dark: { bar: "#1c1920", edge: "rgba(255,255,255,0.11)", dot: "#3b3641", muted: "#a59dab", pill: "#27232c", shadow: "rgba(0,0,0,0.45)" },
};

// windowHTML draws one capture inside a window whose address pill shows url.
export function windowHTML({ image, url, width, scheme }) {
  const p = palette[scheme];
  return `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; background: transparent; }
  .pad { display: inline-block; padding: 26px 34px 46px; }
  .win { width: ${width}px; border-radius: 12px; overflow: hidden; border: 1px solid ${p.edge}; background: ${p.bar};
    box-shadow: 0 22px 48px -8px ${p.shadow}, 0 4px 12px -2px ${p.shadow}; }
  .bar { position: relative; height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 14px; border-bottom: 1px solid ${p.edge}; }
  .dot { width: 11px; height: 11px; border-radius: 50%; background: ${p.dot}; }
  .url { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 5px 14px; border-radius: 6px; background: ${p.pill};
    color: ${p.muted}; font: 500 11.5px/1 -apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif; white-space: nowrap; }
  img { display: block; width: 100%; }
</style><div class="pad" id="frame"><div class="win"><div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span class="url">${url}</span></div><img src="file://${image}"></div></div>`;
}

// render captures the #frame element of html as a PNG with a transparent
// background, written to dir/name.png.
export async function render(browser, dir, name, html, { scale = 2, width = 1400 } = {}) {
  const file = join(dir, `${name}.html`);
  writeFileSync(file, html);
  const page = await browser.newPage({ width, height: 900, scale });
  await page.goto("file://" + file);
  await page.eval(images);
  const out = join(dir, `${name}.png`);
  await page.shot(out, { clip: await page.eval(rect("#frame")), transparent: true });
  await page.close();
  return out;
}

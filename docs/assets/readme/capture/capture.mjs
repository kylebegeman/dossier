// Refreshes the README images from the built showcase.
//
//   node docs/assets/readme/capture/capture.mjs [--out DIR] [--site DIR] [--bin PATH] [--keep] [set ...]
//
// It runs `make site` in core (unless --site names a site already built),
// captures the pages in headless Chrome in light and dark, frames them, and
// writes lossless WebP (cwebp) and GIF (ffmpeg) into --out, which is
// docs/assets/readme unless given. Sets pick a subset: hero, kinds, loop,
// decide, phones, studio. With --out anywhere else, it ends by comparing
// each image with the committed one: dimensions, and how many pixels differ.
// The studio set builds the binary (or uses --bin) and serves a copy of the
// review on a free port for the length of the capture. --keep leaves the
// raw captures in the printed work directory.
//
// Needs Node 22 or newer, Go, cwebp, ffmpeg, and Chrome at CHROME_PATH or the
// macOS default. Pages render in the fonts installed on the machine.
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atExit, images, launch, rect, sleep, track } from "./cdp.mjs";
import { render, windowHTML } from "./frame.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const core = join(repo, "core");
const committed = resolve(here, "..");
const schemes = ["light", "dark"];
const sets = ["hero", "kinds", "loop", "decide", "phones", "studio"];

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const flag = (name) => { const i = args.indexOf(name); return i >= 0 && args.splice(i, 1).length > 0; };
const out = resolve(option("--out") ?? committed);
const siteOption = option("--site");
const binOption = option("--bin");
const keep = flag("--keep");
const chosen = args.length ? args : sets;
for (const s of chosen) if (!sets.includes(s)) throw new Error(`unknown set ${s}; choose from ${sets.join(", ")}`);

const needs = (cmd, versionArg) => { try { execFileSync(cmd, [versionArg], { stdio: "ignore" }); } catch { throw new Error(`${cmd} is not installed`); } };
needs("cwebp", "-version");
if (chosen.includes("decide")) needs("ffmpeg", "-version");
if (!siteOption) execFileSync("make", ["-s", "site"], { cwd: core, stdio: ["ignore", "ignore", "inherit"] });
const site = resolve(siteOption ?? join(repo, "site"));
const work = mkdtempSync(join(tmpdir(), "dossier-capture-"));
atExit(() => { if (keep) console.log(`raw captures kept in ${work}`); else rmSync(work, { recursive: true, force: true }); });
mkdirSync(out, { recursive: true });
const page = (file) => `file://${join(site, file)}`;
const written = [];
const webp = (png, name) => {
  const dest = join(out, name);
  execFileSync("cwebp", ["-quiet", "-lossless", "-z", "9", png, "-o", dest]);
  written.push(dest);
};

// The lead of the showcase, and one view of each kind scrolled to its board.
const views = {
  hero: [{ name: "hero", file: "booking-service.html", width: 1440, height: 900 }],
  kinds: [
    { name: "kind-brainstorm", file: "booking-service.html", target: "#ideas", offset: 18 },
    { name: "kind-plan", file: "offline-boarding-passes.html", target: "#sign", offset: 18 },
    { name: "kind-review", file: "tide-aware-cancellations.html", target: "#findings", offset: 18 },
    { name: "kind-release", file: "release-3-4-0.html", target: "#gates", offset: 18 },
    { name: "kind-incident", file: "car-deck-double-booking.html", target: "#timeline", offset: 18 },
    { name: "kind-brief", file: "checkout-abandonment.html", target: ".chart", offset: 40 },
  ],
};

async function capturePages(browser, list) {
  for (const scheme of schemes) {
    for (const v of list) {
      const tab = await browser.newPage({ width: v.width ?? 1280, height: v.height ?? 470, scheme });
      await tab.fresh(page(v.file));
      if (v.target) {
        await tab.eval(`window.scrollTo(0, document.querySelector(${JSON.stringify(v.target)}).getBoundingClientRect().top + scrollY - ${v.offset})`);
        await sleep(500);
      }
      const raw = await tab.shot(join(work, `raw-${v.name}-${scheme}.png`));
      await tab.close();
      const url = `kylebegeman.github.io/dossier/${v.file}`;
      webp(await render(browser, work, `${v.name}-${scheme}`, windowHTML({ image: raw, url, width: 1040, scheme })), `${v.name}-${scheme}.webp`);
    }
  }
}

// The loop graphic is drawn, not captured: model, build, decide, apply.
const loopColors = {
  light: { ink: "#201c22", muted: "#6b6270", card: "#ffffff", edge: "rgba(32,28,34,0.12)", chip: "#f5f2f6", chipInk: "#3b3440", accent: "#c81e4a", teal: "#08776e", violet: "#6a46d9", line: "#d9d2dc", shadow: "rgba(24,18,30,0.10)" },
  dark: { ink: "#f3eff5", muted: "#a59dab", card: "#18151b", edge: "rgba(255,255,255,0.12)", chip: "#232027", chipInk: "#ddd6e2", accent: "#f47a9a", teal: "#5fd3c4", violet: "#b39cff", line: "#3a3540", shadow: "rgba(0,0,0,0.4)" },
};
const icons = {
  model: (c) => `<svg viewBox="0 0 48 48" width="52" height="52"><rect x="9" y="5" width="30" height="38" rx="5" fill="none" stroke="${c}" stroke-width="3"/><path d="M19 17l-4 7 4 7M29 17l4 7-4 7" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  build: (c) => `<svg viewBox="0 0 48 48" width="52" height="52"><rect x="5" y="9" width="38" height="30" rx="5" fill="none" stroke="${c}" stroke-width="3"/><path d="M13 19l6 5-6 5M23 30h11" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  decide: (c) => `<svg viewBox="0 0 48 48" width="52" height="52"><rect x="7" y="5" width="34" height="38" rx="5" fill="none" stroke="${c}" stroke-width="3"/><path d="M14 16h20M14 24h12" stroke="${c}" stroke-width="3" stroke-linecap="round"/><path d="M15 33l4 4 8-9" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  apply: (c) => `<svg viewBox="0 0 48 48" width="52" height="52"><path d="M38 20a15 15 0 1 0 1 9" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/><path d="M39 10v11H28" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

function loopHTML(scheme) {
  const c = loopColors[scheme];
  const station = (n, icon, tone, title, text, chip) => `<div class="st"><div class="head"><span class="n" style="color:${tone};background:${c.chip}">${n}</span>${icons[icon](tone)}</div><b>${title}</b><p>${text}</p><code>${chip}</code></div>`;
  const arrow = `<svg class="arrow" viewBox="0 0 40 20" width="40" height="20"><path d="M2 10h32M26 3l8 7-8 7" fill="none" stroke="${c.line}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<!doctype html><meta charset="utf-8"><style>
    html, body { margin: 0; background: transparent; }
    #frame { display: inline-block; padding: 24px 30px 40px; }
    .wrap { width: 1330px; padding: 34px 34px 28px; border-radius: 18px; background: ${c.card}; border: 1px solid ${c.edge}; box-shadow: 0 20px 44px -12px ${c.shadow};
      font-family: -apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif; color: ${c.ink}; }
    .row { display: flex; align-items: flex-start; gap: 10px; }
    .st { flex: 1; min-width: 0; }
    .head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .n { display: inline-grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; font-weight: 700; font-size: 19px; }
    b { display: block; font-size: 29px; font-weight: 650; letter-spacing: -0.015em; margin-bottom: 8px; }
    p { margin: 0 0 16px; color: ${c.muted}; font-size: 20px; line-height: 1.4; min-height: 56px; }
    code { display: inline-block; max-width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px; background: ${c.chip}; color: ${c.chipInk};
      font: 500 15.5px/1.3 "SF Mono", ui-monospace, Menlo, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .arrow { flex: none; margin-top: 76px; }
    .back { display: flex; align-items: center; gap: 14px; margin: 26px 4px 0; color: ${c.muted}; font-size: 18px; }
    .back i { flex: 1; height: 0; border-top: 2px dashed ${c.line}; }
    .back span { white-space: nowrap; }
  </style><div id="frame"><div class="wrap"><div class="row">
    ${station(1, "model", c.accent, "Write a model", "An agent fills in one JSON file.", "review.dossier.json")}${arrow}
    ${station(2, "build", c.teal, "Build the page", "One command renders one page.", "dossier build")}${arrow}
    ${station(3, "decide", c.violet, "Decide by number", "A person reads, then copies one reply.", "rework, fix 1, 2; later 4.")}${arrow}
    ${station(4, "apply", c.accent, "Apply the reply", "The decisions go back into the model.", "dossier decisions apply")}
  </div><div class="back"><i></i><span>then the agent does the work and builds the next page</span><i></i></div></div></div>`;
}

async function captureLoop(browser) {
  for (const scheme of schemes) webp(await render(browser, work, `loop-${scheme}`, loopHTML(scheme), { width: 1500 }), `loop-${scheme}.webp`);
}

// Deciding a release, step by step: the gates table above Your reply, with
// a cursor on the control that changed and a caption naming the step.
const decideSteps = [
  { label: "", act: null, target: null },
  { label: "Choose Ship", act: `document.querySelector('input[data-choice][value="ship"]').click()`, target: 'input[data-choice][value="ship"]' },
  { label: "Waive gate 1", act: verdict("android-e2e", "waive"), target: 'select[data-verdict-row="android-e2e"]' },
  { label: "Rerun gate 2", act: verdict("store-review", "rerun"), target: 'select[data-verdict-row="store-review"]' },
];
const holds = [1.8, 2.0, 2.0, 3.2];
function verdict(id, value) {
  return `(() => { const s = document.querySelector('select[data-verdict-row="${id}"]'); s.value = '${value}'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`;
}
const tableClip = `(() => { const t = document.querySelector('#gates table'); const r = t.querySelectorAll('tbody tr')[3]; const a = t.getBoundingClientRect(), b = r.getBoundingClientRect(); return { x: a.left + scrollX - 1, y: a.top + scrollY - 1, width: a.width + 2, height: b.bottom - a.top + 2 }; })()`;
const center = (selector) => `(() => { const e = document.querySelector(${JSON.stringify(selector)}); const b = e.getBoundingClientRect(); return { x: b.left + scrollX + b.width / 2, y: b.top + scrollY + b.height / 2 }; })()`;
const decideTheme = {
  light: { page: "#ffffff", bar: "#f5f3f6", edge: "rgba(32,28,34,0.14)", dot: "#dcd6df", muted: "#766e7c", pill: "#ebe7ed", body: "#ffffff", cap: "#201c22", capText: "#ffffff", shadow: "rgba(24,18,30,0.14)" },
  dark: { page: "#0d1117", bar: "#1c1920", edge: "rgba(255,255,255,0.12)", dot: "#3b3641", muted: "#a59dab", pill: "#27232c", body: "#141216", cap: "#f3eff5", capText: "#141216", shadow: "rgba(0,0,0,0.5)" },
};
const cursor = `<svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg"><path d="M2 2 L2 24 L8 18.5 L12 27.5 L16 25.8 L12 17 L20 17 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;

async function captureDecide(browser) {
  const W = 800, pad = 22, gap = 18, bar = 34;
  for (const scheme of schemes) {
    const tab = await browser.newPage({ width: 1120, height: 900, scheme });
    await tab.fresh(page("release-3-4-0.html"));
    const steps = [];
    for (const [i, step] of decideSteps.entries()) {
      if (step.act) { await tab.eval(step.act); await sleep(400); }
      const table = await tab.eval(tableClip), pick = await tab.eval(rect("#pick", 1));
      await tab.shot(join(work, `decide-table-${scheme}-${i}.png`), { clip: table });
      await tab.shot(join(work, `decide-pick-${scheme}-${i}.png`), { clip: pick });
      steps.push({ ...step, table, pick, at: step.target ? await tab.eval(center(step.target)) : null });
    }
    await tab.close();
    const t = decideTheme[scheme], s = (W - 2 * pad) / steps[0].table.width;
    const tableH = Math.max(...steps.map((x) => x.table.height)) * s;
    const pickH = Math.max(...steps.map((x) => x.pick.height)) * s;
    const H = bar + pad + tableH + gap + pickH + pad;
    const frames = [];
    for (const [i, step] of steps.entries()) {
      let pointer = "";
      if (step.at) {
        const inTable = step.at.y <= step.table.y + step.table.height;
        const x = pad + (step.at.x - (inTable ? step.table.x : step.pick.x)) * s;
        const y = bar + pad + (inTable ? (step.at.y - step.table.y) * s : tableH + gap + (step.at.y - step.pick.y) * s);
        pointer = `<div style="position:absolute;left:${x - 2}px;top:${y - 3}px">${cursor}</div>`;
      }
      const caption = step.label ? `<div class="cap">${i}. ${step.label}</div>` : `<div class="cap idle">Decide by number</div>`;
      const fade = "-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent)";
      const html = `<!doctype html><meta charset="utf-8"><style>
        html, body { margin: 0; background: ${t.page}; }
        #frame { display: inline-block; padding: 26px 34px 34px; background: ${t.page}; }
        .win { position: relative; width: ${W}px; height: ${H}px; border-radius: 12px; overflow: hidden; border: 1px solid ${t.edge}; background: ${t.body}; box-shadow: 0 18px 40px -10px ${t.shadow}; }
        .bar { position: relative; height: ${bar}px; display: flex; align-items: center; gap: 7px; padding: 0 14px; background: ${t.bar}; border-bottom: 1px solid ${t.edge}; box-sizing: border-box; }
        .dot { width: 11px; height: 11px; border-radius: 50%; background: ${t.dot}; }
        .url { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 5px 14px; border-radius: 6px; background: ${t.pill}; color: ${t.muted}; font: 500 11.5px/1 -apple-system, "SF Pro Text", system-ui, sans-serif; }
        .shot { position: absolute; left: ${pad}px; width: ${W - 2 * pad}px; display: block; }
        .cap { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); padding: 5px 11px; border-radius: 999px; background: ${t.cap}; color: ${t.capText}; font: 600 11.5px/1 -apple-system, "SF Pro Text", system-ui, sans-serif; }
        .cap.idle { background: transparent; color: ${t.muted}; font-weight: 500; }
      </style><div id="frame"><div class="win"><div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span class="url">release-3-4-0.html</span>${caption}</div>
        <img class="shot" style="top:${bar + pad}px;${fade}" src="file://${join(work, `decide-table-${scheme}-${i}.png`)}">
        <img class="shot" style="top:${bar + pad + tableH + gap}px" src="file://${join(work, `decide-pick-${scheme}-${i}.png`)}">
        ${pointer}</div></div>`;
      const file = join(work, `decide-${scheme}-${i}.html`);
      writeFileSync(file, html);
      const frame = await browser.newPage({ width: W + 100, height: Math.ceil(H) + 100, scale: 1.5 });
      await frame.goto("file://" + file);
      await frame.eval(images);
      const clip = await frame.eval(`(() => { const b = document.getElementById('frame').getBoundingClientRect(); return { x: 0, y: 0, width: Math.ceil(b.width), height: Math.ceil(b.height) }; })()`);
      frames.push(await frame.shot(join(work, `decide-frame-${scheme}-${i}.png`), { clip }));
      await frame.close();
    }
    // Each step holds long enough to read, the last one longest.
    const list = join(work, `decide-${scheme}.txt`);
    writeFileSync(list, frames.map((f, i) => `file '${f}'\nduration ${holds[i]}`).join("\n") + `\nfile '${frames[frames.length - 1]}'\n`);
    const dest = join(out, `decide-${scheme}.gif`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
      "-vf", "fps=8,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a", "-loop", "0", dest]);
    written.push(dest);
  }
}

// Two phones: the incident page in light and a review finding in dark, in
// one image whose transparent surround suits both GitHub themes.
async function capturePhones(browser) {
  const shots = [
    { name: "phone-light", scheme: "light", file: "car-deck-double-booking.html" },
    { name: "phone-dark", scheme: "dark", file: "tide-aware-cancellations.html", act: `(() => { const d = document.getElementById('utc-tides'); d.open = true; window.scrollTo(0, d.getBoundingClientRect().top + scrollY - 4); })()` },
  ];
  const bg = {};
  for (const s of shots) {
    // The screen below a status bar, which the composite draws in the page's background.
    const tab = await browser.newPage({ width: 390, height: 800, scale: 3, scheme: s.scheme, mobile: true });
    await tab.fresh(page(s.file));
    if (s.act) { await tab.eval(s.act); await sleep(500); }
    bg[s.name] = await tab.eval("getComputedStyle(document.body).backgroundColor");
    await tab.shot(join(work, `${s.name}.png`));
    await tab.close();
  }
  const ink = (name) => (name.endsWith("dark") ? "#f3eff5" : "#201c22");
  const phone = (img) => `<div class="phone"><div class="status" style="background:${bg[img]};color:${ink(img)}"><span>9:41</span><i class="island"></i><span class="dots">&#9679;&#9679;&#9679;</span></div><img src="file://${join(work, img + ".png")}"></div>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    html, body { margin: 0; background: transparent; }
    #frame { display: inline-flex; gap: 44px; padding: 26px 40px 48px; align-items: flex-start; }
    .phone { position: relative; width: 300px; height: 649px; padding: 11px; border-radius: 52px; background: #1d1c21; overflow: hidden;
      box-shadow: inset 0 0 0 1.5px #3a3940, 0 26px 50px -14px rgba(24,18,30,0.22); }
    .phone:nth-child(2) { margin-top: 36px; }
    .status { position: relative; height: 34px; border-radius: 41px 41px 0 0; display: flex; align-items: center; justify-content: space-between; padding: 0 26px 0 30px;
      font: 600 12.5px/1 -apple-system, "SF Pro Text", system-ui, sans-serif; }
    .dots { font-size: 7px; letter-spacing: 1px; opacity: 0.8; }
    .island { position: absolute; left: 50%; top: 8px; width: 84px; height: 23px; transform: translateX(-50%); border-radius: 20px; background: #0a0a0c; }
    .phone img { display: block; width: 300px; height: 615px; border-radius: 0 0 41px 41px; object-fit: cover; object-position: top; }
  </style><div id="frame">${phone("phone-light")}${phone("phone-dark")}</div>`;
  webp(await render(browser, work, "phones", html, { width: 900 }), "phones.webp");
}

// The studio on the review: edit mode on, one summary drafted, and the
// inline editor open on a facet, with the studio bar in view.
async function captureStudio(browser) {
  const dir = join(work, "studio");
  mkdirSync(dir);
  copyFileSync(join(core, "examples", "tide-aware-cancellations.dossier.json"), join(dir, "tides.dossier.json"));
  let bin = binOption && resolve(binOption);
  if (!bin) {
    bin = join(work, "dossier");
    execFileSync("go", ["build", "-o", bin, "./cmd/dossier"], { cwd: core, env: { ...process.env, CGO_ENABLED: "0" }, stdio: "inherit" });
  }
  const server = spawn(bin, ["serve", "tides.dossier.json", "--port", "0"], { cwd: dir, stdio: ["ignore", "ignore", "pipe"] });
  const stop = track(server);
  try {
    // The studio prints its address, with the port it chose, on stderr.
    const base = await new Promise((ok, fail) => {
      let text = "";
      server.stderr.on("data", (d) => { text += d; const m = text.match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) ok(m[0]); });
      server.once("exit", (code) => fail(new Error(`dossier serve exited with ${code}: ${text}`)));
      setTimeout(() => fail(new Error("dossier serve did not start")), 20000).unref();
    });
    for (const [i, scheme] of schemes.entries()) {
      const tab = await browser.newPage({ width: 1440, height: 900, scheme });
      await tab.fresh(base);
      if (i === 0) {
        // One draft serves both captures: the studio keeps it in its store.
        const status = await tab.eval(`(async () => {
          const cfg = JSON.parse(document.getElementById('dossier-studio').textContent);
          const res = await fetch('/_/drafts', { method: 'PUT', headers: { 'X-Dossier-Token': cfg.token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: '/items/utc-tides/summary', value: 'Sailing times are local and tide times are UTC, so from March to October every check reads the wrong hour.' }) });
          return res.status;
        })()`);
        if (status !== 200) throw new Error(`the studio refused the draft: ${status}`);
        await sleep(1200);
        await tab.goto(base);
      }
      await tab.eval(`(() => { const b = [...document.querySelectorAll('.studio-bar button')].find((x) => x.textContent.trim() === 'Edit'); if (b) b.click(); })()`);
      await sleep(400);
      await tab.eval(`document.getElementById('utc-tides').open = true`);
      await sleep(300);
      await tab.eval(`document.querySelector('[data-edit="/items/utc-tides/facets/fix/markdown"]').click()`);
      await sleep(900);
      await tab.eval(`window.scrollTo(0, document.getElementById('utc-tides').getBoundingClientRect().top + scrollY - 90)`);
      await sleep(500);
      const raw = await tab.shot(join(work, `raw-studio-${scheme}.png`));
      await tab.close();
      webp(await render(browser, work, `studio-${scheme}`, windowHTML({ image: raw, url: "127.0.0.1:4321", width: 1040, scheme })), `studio-${scheme}.webp`);
    }
  } finally {
    await stop();
  }
}

// dimensions reads an image's size from its header: WebP, GIF, or PNG.
function dimensions(file) {
  const b = readFileSync(file);
  if (b.toString("latin1", 0, 4) === "RIFF") {
    const chunk = b.toString("latin1", 12, 16);
    if (chunk === "VP8L") { const bits = b.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
    if (chunk === "VP8X") return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
    if (chunk === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  if (b.toString("latin1", 0, 3) === "GIF") return [b.readUInt16LE(6), b.readUInt16LE(8)];
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  throw new Error(`not an image this script reads: ${file}`);
}

// changed reports the share of pixels that differ between two still images
// of the same size, decoded by Chrome. A GIF is compared by its bytes.
async function changed(browser, a, b) {
  const x = readFileSync(a), y = readFileSync(b);
  if (a.endsWith(".gif")) return x.equals(y) ? 0 : null;
  const type = a.endsWith(".webp") ? "image/webp" : "image/png";
  const tab = await browser.newPage({ width: 200, height: 200, scale: 1 });
  const share = await tab.eval(`(async () => {
    const load = (b64) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:${type};base64,' + b64; });
    const [p, q] = await Promise.all([load(${JSON.stringify(x.toString("base64"))}), load(${JSON.stringify(y.toString("base64"))})]);
    const pixels = (img) => { const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight), g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const u = pixels(p), v = pixels(q);
    let n = 0;
    for (let k = 0; k < u.length; k += 4) if (Math.abs(u[k] - v[k]) + Math.abs(u[k + 1] - v[k + 1]) + Math.abs(u[k + 2] - v[k + 2]) + Math.abs(u[k + 3] - v[k + 3]) > 12) n++;
    return n / (u.length / 4);
  })()`);
  await tab.close();
  return share;
}

let browser;
try {
  browser = await launch();
  if (chosen.includes("hero")) await capturePages(browser, views.hero);
  if (chosen.includes("kinds")) await capturePages(browser, views.kinds);
  if (chosen.includes("loop")) await captureLoop(browser);
  if (chosen.includes("decide")) await captureDecide(browser);
  if (chosen.includes("phones")) await capturePhones(browser);
  if (chosen.includes("studio")) await captureStudio(browser);
  const rows = [];
  for (const file of written) {
    const name = file.slice(out.length + 1);
    const [w, h] = dimensions(file);
    const row = [name, `${w}x${h}`];
    if (out !== committed) {
      const old = join(committed, name);
      let before = "none", diff = "new";
      try {
        const [ow, oh] = dimensions(old);
        before = `${ow}x${oh}`;
        if (ow !== w || oh !== h) diff = "size differs";
        else {
          const share = await changed(browser, file, old);
          diff = share === null ? "bytes differ" : share === 0 ? "same" : `${(share * 100).toFixed(2)}% of pixels differ`;
        }
      } catch {}
      row.push(before, diff);
    }
    rows.push(row);
  }
  const head = out === committed ? ["image", "size"] : ["image", "size", "committed", "compared"];
  const widths = head.map((_, i) => Math.max(head[i].length, ...rows.map((r) => r[i].length)));
  for (const r of [head, ...rows]) console.log(r.map((c, i) => c.padEnd(widths[i])).join("  "));
} finally {
  if (browser) await browser.close();
}

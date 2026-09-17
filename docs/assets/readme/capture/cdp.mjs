// A small DevTools protocol client for headless Chrome, with no dependencies:
// one browser, pages with a viewport, color scheme, scripting, and
// screenshots. Chrome comes from CHROME_PATH, or the macOS default. Every
// browser this module starts is stopped when it closes, when the process
// exits, or on Ctrl+C, and its temporary profile is removed.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// deadline is a sleep that does not keep the script alive on its own.
const deadline = (ms) => new Promise((r) => setTimeout(r, ms).unref());

// Everything started here and not yet stopped, with its cleanup. On Ctrl+C
// or SIGTERM each process gets to exit, and its cleanup runs, before the
// script exits; on any other exit whatever remains is killed at once.
const running = new Map();
const onExit = [];
process.on("exit", () => {
  for (const [, t] of running) { t.proc.kill("SIGKILL"); t.cleanup(); }
  for (const fn of onExit) fn();
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await Promise.all([...running.keys()].map((stop) => stop()));
    process.exit(130);
  });
}

// atExit runs fn as the script exits, however it exits.
export const atExit = (fn) => onExit.push(fn);

const alive = (proc) => proc.exitCode === null && proc.signalCode === null;

// track registers a child process and returns stop, which asks it to exit,
// kills it if it has not within five seconds, runs cleanup once it is gone,
// and resolves when that is done. Calling stop again returns the same promise.
export function track(proc, cleanup = () => {}) {
  const exited = new Promise((r) => (alive(proc) ? proc.once("exit", r) : r()));
  let done;
  const stop = () => {
    if (!done) {
      if (alive(proc)) proc.kill("SIGTERM");
      done = Promise.race([exited, deadline(5000)]).then(async () => {
        if (alive(proc)) { proc.kill("SIGKILL"); await exited; }
        cleanup();
        running.delete(stop);
      });
    }
    return done;
  };
  running.set(stop, { proc, cleanup });
  return stop;
}

export async function launch() {
  if (!existsSync(chrome)) throw new Error(`Chrome not found at ${chrome}; set CHROME_PATH`);
  const profile = mkdtempSync(join(tmpdir(), "dossier-capture-chrome-"));
  const proc = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    "--font-render-hinting=none", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const exited = new Promise((r) => proc.once("exit", r));
  const stop = track(proc, () => { try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch {} });
  // Chrome writes the port it chose, and the browser's path, into the profile.
  let url;
  for (let i = 0; i < 100 && !url; i++) {
    await sleep(100);
    try {
      const [port, path] = readFileSync(join(profile, "DevToolsActivePort"), "utf8").trim().split("\n");
      if (port && path) url = `ws://127.0.0.1:${port}${path}`;
    } catch {}
  }
  if (!url) { await stop(); throw new Error("Chrome did not start its DevTools endpoint"); }
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const waiting = new Map();
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, (msg) => (msg.error ? reject(new Error(method + ": " + msg.error.message)) : resolve(msg.result)));
    ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }));
  });

  async function newPage({ width = 1440, height = 900, scale = 2, scheme = "light", mobile = false } = {}) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);
    await s("Page.enable");
    await s("Runtime.enable");
    await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
    await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
    const page = {
      // goto navigates and waits for the document it asked for to finish
      // loading. It marks the document it leaves, so a reload of the same
      // address is waited for too, and it does not trust whichever load
      // event comes first, which under load can be the tab's own
      // about:blank. A navigation that fails is an error, so a missing page
      // never becomes a capture of Chrome's error page.
      async goto(to) {
        await s("Runtime.evaluate", { expression: "window.__leaving = true" });
        const nav = await s("Page.navigate", { url: to });
        if (nav.errorText) throw new Error(`${to}: ${nav.errorText}`);
        const ready = `!window.__leaving && location.href === ${JSON.stringify(new URL(to).href)} && document.readyState === "complete"`;
        for (let i = 0; i < 300; i++) {
          const r = await s("Runtime.evaluate", { expression: ready, returnByValue: true });
          if (r.result && r.result.value === true) break;
          await sleep(50);
        }
        await s("Runtime.evaluate", { expression: "document.documentElement.style.scrollBehavior = 'auto'; document.fonts && document.fonts.ready", awaitPromise: true });
        await sleep(300);
      },
      // fresh opens a page with nothing saved: file:// pages share one
      // localStorage in a profile, so decisions from one capture would
      // otherwise show in the next.
      async fresh(to) {
        await page.goto(to);
        await page.eval("localStorage.clear()");
        await page.goto(to);
      },
      async eval(expression) {
        const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
        return r.result.value;
      },
      async shot(path, { clip, transparent = false } = {}) {
        if (transparent) await s("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
        const params = { format: "png", captureBeyondViewport: !!clip };
        if (clip) params.clip = { ...clip, scale: 1 };
        const r = await s("Page.captureScreenshot", params);
        if (transparent) await s("Emulation.setDefaultBackgroundColorOverride", {});
        writeFileSync(path, Buffer.from(r.data, "base64"));
        return path;
      },
      async close() { await send("Target.closeTarget", { targetId }); },
    };
    return page;
  }

  return {
    newPage,
    async close() {
      try { await Promise.race([send("Browser.close"), deadline(2000)]); } catch {}
      try { ws.close(); } catch {}
      await Promise.race([exited, deadline(3000)]);
      await stop();
    },
  };
}

// rect returns an element's box in page coordinates, padded, for clips.
export const rect = (selector, pad = 0) => `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.max(0, b.left + scrollX - ${pad}), y: Math.max(0, b.top + scrollY - ${pad}), width: b.width + ${2 * pad}, height: b.height + ${2 * pad} }; })()`;

// images waits for every image on the page to load or fail.
export const images = "Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))";

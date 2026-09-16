// Optional headless browser (Playwright Chromium), used for Mermaid diagram rendering
// and PDF export. withBrowser launches a browser, runs the callback, and always closes
// it, so a single generate()/export call never leaves the process alive. The callback
// receives null when Playwright is unavailable, so callers can fall back gracefully.

export async function withBrowser(fn) {
  let browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  } catch {
    return fn(null); // playwright not installed, or no browser available
  }
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

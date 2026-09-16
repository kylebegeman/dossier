import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { DossierModel } from "./model.js";
import { DossierRenderError, renderDossier, resolveBinary } from "./server.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const core = resolve(here, "../../../core");
let bin = process.env.DOSSIER_BIN ?? "";
let scratch = "";

before(() => {
  if (bin) return;
  scratch = mkdtempSync(join(tmpdir(), "dossier-react-"));
  bin = join(scratch, process.platform === "win32" ? "dossier.exe" : "dossier");
  execFileSync("go", ["build", "-o", bin, "./cmd/dossier"], { cwd: core, env: { ...process.env, CGO_ENABLED: "0" }, stdio: "inherit" });
});

after(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

test("renders a typed model to the artifact", async () => {
  const model = JSON.parse(readFileSync(join(core, "examples", "winter-crossing.dossier.json"), "utf8")) as DossierModel;
  const result = await renderDossier(model, { bin, base: join(core, "examples") });
  assert.equal(result.slug, "winter-crossing");
  assert.ok(result.html.includes("data:image/svg+xml;base64,"), "the figure is inlined from base");
  assert.match(result.html, /^<!doctype html>/i);
  assert.ok(result.html.includes('id="dossier-model"'));
  assert.deepEqual(result.warnings, []);
});

test("a model with findings rejects with the findings", async () => {
  const broken = { dossier: "1.0", kind: "brainstorm", meta: { title: "T", slug: "t" }, sections: [] } as unknown as DossierModel;
  await assert.rejects(renderDossier(broken, { bin }), (error: unknown) => {
    assert.ok(error instanceof DossierRenderError);
    assert.equal(error.outcome, "findings");
    assert.equal(error.code, "invalid");
    assert.ok(error.findings.length > 0);
    return true;
  });
});

test("a missing binary is a clear error", async () => {
  await assert.rejects(renderDossier("{}", { bin: join(tmpdir(), "no-such-dossier-binary") }), (error: unknown) => {
    assert.ok(error instanceof DossierRenderError);
    assert.equal(error.code, "binary");
    return true;
  });
});

test("an aborted render stops", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(renderDossier("{}", { bin, signal: controller.signal }), (error: unknown) => error instanceof DossierRenderError && error.code === "aborted");
});

test("the binary resolves from the option, then the environment", () => {
  assert.equal(resolveBinary("/opt/dossier"), "/opt/dossier");
  const saved = process.env.DOSSIER_BIN;
  process.env.DOSSIER_BIN = "/env/dossier";
  try {
    assert.equal(resolveBinary(), "/env/dossier");
  } finally {
    if (saved === undefined) delete process.env.DOSSIER_BIN;
    else process.env.DOSSIER_BIN = saved;
  }
});

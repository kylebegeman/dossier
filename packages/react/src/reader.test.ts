import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

/** The core directory, from dist/ where the compiled test runs. */
const core = new URL("../../../core/", import.meta.url);

interface ReplyCase {
  name: string;
  mode: string;
  verdicts: string[];
  items: Array<{ id: string; n: number; eligible: boolean }>;
  state: { path: string; picked: string[]; verdicts: Record<string, string>; notes: Record<string, string> };
  reply: string;
}

type Reply = (context: Pick<ReplyCase, "mode" | "verdicts" | "items">, state: ReplyCase["state"]) => string;

test("the reader writes the same reply line as the Go parser for every shared case", () => {
  const source = readFileSync(new URL("internal/render/assets/reader.js", core), "utf8");
  const sandbox: { module: { exports: { reply?: Reply } } } = { module: { exports: {} } };
  runInNewContext(source, sandbox);
  const reply = sandbox.module.exports.reply;
  assert.equal(typeof reply, "function", "reader.js exports its reply function outside a browser");
  const file = JSON.parse(readFileSync(new URL("testdata/replies.json", core), "utf8")) as { schema: string; cases: ReplyCase[] };
  assert.equal(file.schema, "dossier.reply-cases/v1");
  assert.ok(file.cases.length >= 10, "the shared cases cover picks, verdicts, and eligibility");
  for (const c of file.cases) {
    assert.equal(reply?.({ mode: c.mode, verdicts: c.verdicts, items: c.items }, c.state), c.reply, c.name);
  }
});

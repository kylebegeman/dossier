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
  labels: Record<string, string>;
  options: Record<string, string>;
  noun: string;
  plural: string;
  items: Array<{ id: string; n: number; eligible: boolean }>;
  state: { path: string; picked: string[]; verdicts: Record<string, string>; notes: Record<string, string> };
  reply: string;
  words: string;
  undecided: boolean;
}

type Context = Pick<ReplyCase, "mode" | "verdicts" | "labels" | "options" | "noun" | "plural" | "items">;
type Say<T> = (context: Context, state: ReplyCase["state"]) => T;

test("the reader writes the same reply line, in the same words, as Go for every shared case", () => {
  const source = readFileSync(new URL("internal/render/assets/reader.js", core), "utf8");
  const sandbox: { module: { exports: { reply?: Say<string>; words?: Say<string>; empty?: Say<boolean> } } } = { module: { exports: {} } };
  runInNewContext(source, sandbox);
  const { reply, words, empty } = sandbox.module.exports;
  assert.equal(typeof reply, "function", "reader.js exports its reply function outside a browser");
  assert.equal(typeof words, "function", "reader.js exports its words function outside a browser");
  assert.equal(typeof empty, "function", "reader.js exports its empty function outside a browser");
  const file = JSON.parse(readFileSync(new URL("testdata/replies.json", core), "utf8")) as { schema: string; cases: ReplyCase[] };
  assert.equal(file.schema, "dossier.reply-cases/v1");
  assert.ok(file.cases.length >= 10, "the shared cases cover picks, verdicts, and eligibility");
  for (const c of file.cases) {
    const context: Context = { mode: c.mode, verdicts: c.verdicts, labels: c.labels, options: c.options, noun: c.noun, plural: c.plural, items: c.items };
    assert.equal(reply?.(context, c.state), c.reply, c.name);
    assert.equal(words?.(context, c.state), c.words, c.name);
    assert.equal(empty?.(context, c.state), c.undecided, c.name);
  }
});

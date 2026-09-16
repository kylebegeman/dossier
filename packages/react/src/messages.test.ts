import assert from "node:assert/strict";
import { test } from "node:test";
import { readerMessage } from "./messages.js";

test("accepts the reader's height and decisions messages", () => {
  assert.deepEqual(readerMessage({ type: "dossier:height", slug: "moves", height: 1200.4 }), { type: "dossier:height", slug: "moves", height: 1201 });
  const decisions = { path: "storms", picked: ["storm-rebook"], verdicts: {}, notes: { "storm-rebook": "keep blue" }, reply: "storms, 1. Notes: 1: keep blue." };
  assert.deepEqual(readerMessage({ type: "dossier:decisions", slug: "winter-crossing", decisions }), { type: "dossier:decisions", slug: "winter-crossing", decisions });
  const verdicts = { path: "rework", picked: [], verdicts: { "tide-offset": "fix", "copy-tone": "later" }, notes: {}, reply: "rework, fix 1; later 2." };
  assert.deepEqual(readerMessage({ type: "dossier:decisions", slug: "tides", decisions: verdicts }), { type: "dossier:decisions", slug: "tides", decisions: verdicts });
  const older = { path: "", picked: ["storm-rebook"], notes: {}, reply: "1." };
  assert.deepEqual(readerMessage({ type: "dossier:decisions", slug: "winter-crossing", decisions: older }), { type: "dossier:decisions", slug: "winter-crossing", decisions: { ...older, verdicts: {} } });
});

test("rejects anything that is not exactly a reader message", () => {
  for (const data of [
    null,
    "dossier:height",
    { type: "dossier:height", height: 10 },
    { type: "dossier:height", slug: "s", height: -1 },
    { type: "dossier:height", slug: "s", height: Number.NaN },
    { type: "dossier:decisions", slug: "s", decisions: { path: "", picked: [1], notes: {}, reply: "" } },
    { type: "dossier:decisions", slug: "s", decisions: { path: "", picked: [], notes: { a: 1 }, reply: "" } },
    { type: "dossier:decisions", slug: "s", decisions: { path: "", picked: [], verdicts: { a: 2 }, notes: {}, reply: "" } },
    { type: "dossier:decisions", slug: "s", decisions: { path: "", picked: [], verdicts: ["fix"], notes: {}, reply: "" } },
    { type: "dossier:decisions", slug: "s" },
    { type: "other", slug: "s" },
  ]) {
    assert.equal(readerMessage(data), null, JSON.stringify(data));
  }
});

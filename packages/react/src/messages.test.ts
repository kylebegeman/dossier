import assert from "node:assert/strict";
import { test } from "node:test";
import { readerMessage } from "./messages.js";

test("accepts the reader's height and decisions messages", () => {
  assert.deepEqual(readerMessage({ type: "dossier:height", slug: "moves", height: 1200.4 }), { type: "dossier:height", slug: "moves", height: 1201 });
  const decisions = { path: "rebuild", picked: ["shell-reset"], notes: { "shell-reset": "keep blue" }, reply: "rebuild, 1. Notes: 1: keep blue." };
  assert.deepEqual(readerMessage({ type: "dossier:decisions", slug: "moves", decisions }), { type: "dossier:decisions", slug: "moves", decisions });
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
    { type: "dossier:decisions", slug: "s" },
    { type: "other", slug: "s" },
  ]) {
    assert.equal(readerMessage(data), null, JSON.stringify(data));
  }
});

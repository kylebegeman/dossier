import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_SANDBOX, DossierFrame } from "./index.js";

test("renders the artifact in a sandboxed, auto-sized frame", () => {
  const markup = renderToStaticMarkup(<DossierFrame html={'<!doctype html><p class="x">Hi & bye</p>'} title="Moves" />);
  assert.match(markup, /^<iframe /);
  assert.match(markup, /title="Moves"/);
  assert.match(markup, /srcDoc="&lt;!doctype html&gt;&lt;p class=&quot;x&quot;&gt;Hi &amp; bye&lt;\/p&gt;"/i);
  assert.ok(markup.includes(`sandbox="${DEFAULT_SANDBOX}"`));
  assert.ok(!DEFAULT_SANDBOX.includes("allow-same-origin"), "the default frame must not share the host's origin");
  assert.match(markup, /allow="clipboard-write"/);
  assert.match(markup, /height:640px/);
});

test("fixed height leaves sizing to the caller", () => {
  const markup = renderToStaticMarkup(<DossierFrame html="<p>x</p>" autoHeight={false} style={{ height: 900 }} sandbox="allow-scripts allow-same-origin" className="doc" />);
  assert.match(markup, /height:900px/);
  assert.match(markup, /sandbox="allow-scripts allow-same-origin"/);
  assert.match(markup, /class="doc"/);
});

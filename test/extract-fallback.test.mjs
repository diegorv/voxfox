// If Defuddle itself breaks, VoxFox still reads the page's main area.
// Needs --experimental-test-module-mocks (set in the npm test script).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

mock.module("defuddle", {
  defaultExport: class {
    parse() {
      throw new Error("boom");
    }
  },
});
const { extractPage } = await import("../src/extract.js");

test("reads <main> when Defuddle throws", () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>Den notes</title></head><body>
    <nav><a href="/">Home</a></nav>
    <main><h1>Den notes</h1><p>The kits opened their eyes today.</p><p>Mother fox brought a vole.</p></main>
    <footer>Cookie settings</footer></body></html>`, { url: "https://example.com/" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser });

  const page = extractPage();
  assert.deepEqual(page.blocks, ["Den notes.", "The kits opened their eyes today.", "Mother fox brought a vole."]);
  assert.equal(page.title, "Den notes");
});

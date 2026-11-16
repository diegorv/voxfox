// The extraction chain when Defuddle breaks: Readability (plan B), then a plain
// scan of <main>/<article>/<body> (plan C).
// Needs --experimental-test-module-mocks (set in the npm test script).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

mock.module("defuddle", {
  defaultExport: class {
    parse() {
      throw new Error("defuddle boom");
    }
  },
});

// Real Readability unless a test makes it fail.
const real = await import("@mozilla/readability");
let readabilityFails = false;
mock.module("@mozilla/readability", {
  namedExports: {
    Readability: class {
      constructor(...args) {
        this.inner = new real.Readability(...args);
      }
      parse() {
        if (readabilityFails) throw new Error("readability boom");
        return this.inner.parse();
      }
    },
  },
});
const { extractPage } = await import("../src/extract.js");

// No <main>, so plan C would read the nav and footer too; Readability would not.
const PAGE = `<!doctype html><html><head><title>Den notes</title></head><body>
  <nav><ul><li><a href="/">Home</a></li><li><a href="/subscribe">Subscribe now!</a></li></ul></nav>
  <div class="post">
    <h1>Den notes</h1>
    <p>The kits opened their eyes today and started wobbling around the den entrance, sniffing everything in reach.</p>
    <p>Mother fox brought back a vole and two mice, which the kits fought over loudly until dusk settled over the meadow.</p>
    <p>We saw the father fox for the first time this season, resting near the old oak tree at the edge of the field.</p>
  </div>
  <footer><p>Cookie settings</p></footer></body></html>`;

function load(html) {
  const dom = new JSDOM(html, { url: "https://example.com/" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser });
  return dom;
}

test("plan B: Readability reads the article when Defuddle throws", () => {
  readabilityFails = false;
  const dom = load(PAGE);
  const before = dom.window.document.documentElement.outerHTML;
  const all = extractPage().blocks.join("\n");
  assert.equal(dom.window.document.documentElement.outerHTML, before, "the page must not change");
  assert.match(all, /kits opened their eyes/);
  assert.match(all, /father fox for the first time/);
  assert.doesNotMatch(all, /Subscribe now/);
  assert.doesNotMatch(all, /Cookie settings/);
});

test("plan C: scans the page when Readability fails too", () => {
  readabilityFails = true;
  load(PAGE);
  const page = extractPage();
  const all = page.blocks.join("\n");
  assert.match(all, /kits opened their eyes/);
  assert.match(all, /father fox for the first time/);
  assert.equal(page.title, "Den notes");
});

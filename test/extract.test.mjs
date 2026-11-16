// What VoxFox reads from a page: the selection if any, else the main content, else a plain scan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// extract.js uses the page's globals, like the content script does.
function load(html) {
  const dom = new JSDOM(html, { url: "https://example.com/post", pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser;
  return dom;
}
const { extractPage } = await import("../src/extract.js");
const text = (page) => page.blocks.join("\n");

const PARAGRAPH = (topic) =>
  `<p>The red fox is the largest of the true foxes and one of the most widely distributed members of the order Carnivora. ${topic} It is present across the entire Northern Hemisphere, including most of North America, Europe and Asia.</p>`;

const ARTICLE = `<!doctype html><html lang="en"><head><title>The Red Fox | Fox Facts</title></head><body>
<header><nav><a href="/">Home</a> <a href="/about">About</a> <a href="/subscribe">Subscribe now!</a></nav></header>
<div class="layout">
  <aside class="sidebar"><h3>Popular posts</h3><ul><li><a href="/a">Ten cat facts</a></li><li><a href="/b">Why owls hoot</a></li></ul></aside>
  <main><article>
    <h1>The Red Fox</h1>
    ${PARAGRAPH("Foxes are clever.")}
    ${PARAGRAPH("Red foxes are usually solitary hunters.")}
    <h2>Behaviour</h2>
    ${PARAGRAPH("Foxes communicate with a wide range of sounds.")}
  </article></main>
</div>
<footer><p>© 2026 Fox Facts. Cookie settings. Privacy policy.</p></footer>
</body></html>`;

test("reads the article and skips nav, sidebar and footer", () => {
  load(ARTICLE);
  const page = extractPage();
  const all = text(page);
  assert.equal(page.source, "page");
  assert.match(all, /Red foxes are usually solitary hunters/);
  assert.match(all, /Foxes communicate with a wide range of sounds/);
  assert.match(all, /Behaviour\./, "headings become their own sentence");
  for (const junk of ["Subscribe now", "Popular posts", "Ten cat facts", "Cookie settings"]) {
    assert.doesNotMatch(all, new RegExp(junk), `should skip "${junk}"`);
  }
});

test("starts with the title, once", () => {
  load(ARTICLE);
  const page = extractPage();
  assert.match(page.blocks[0], /^The Red Fox/);
  assert.equal(page.blocks.filter((b) => b.startsWith("The Red Fox")).length, 1);
});

test("reads only the selection when there is one", () => {
  const dom = load(ARTICLE);
  const p = dom.window.document.querySelectorAll("article p")[1];
  dom.window.getSelection().selectAllChildren(p);
  const page = extractPage();
  assert.equal(page.source, "selection");
  assert.equal(page.blocks.length, 1);
  assert.match(page.blocks[0], /^The red fox is the largest.*solitary hunters/);
});

test("still reads short pages that have no article", () => {
  load(`<!doctype html><html><head><title>Note</title></head><body><main><p>Back in five minutes.</p></main></body></html>`);
  assert.match(text(extractPage()), /Back in five minutes\./);
});

test("leads with the page title when the article has no heading", () => {
  load(`<!doctype html><html><head><title>Fox diaries</title></head><body>
    <main><article>${PARAGRAPH("Day one.")}${PARAGRAPH("Day two.")}</article></main></body></html>`);
  const page = extractPage();
  assert.equal(page.blocks[0], "Fox diaries.");
  assert.match(page.blocks[1], /^The red fox is the largest/);
});

test("splits a multi-paragraph selection into blocks", () => {
  const dom = load(ARTICLE);
  const doc = dom.window.document;
  const ps = doc.querySelectorAll("article p");
  const range = doc.createRange();
  range.setStartBefore(ps[0]);
  range.setEndAfter(ps[1]);
  dom.window.getSelection().addRange(range);
  const page = extractPage();
  assert.equal(page.source, "selection");
  assert.ok(page.blocks.length >= 2, `got ${page.blocks.length} block(s)`);
  assert.match(page.blocks[0], /Foxes are clever/);
  assert.match(page.blocks.at(-1), /solitary hunters/);
});

test("falls back to the main area when Defuddle finds almost nothing", () => {
  // Defuddle settles on the tiny <article> and misses the posts next to it.
  const posts = [
    "The kits opened their eyes today and started wobbling around the den entrance.",
    "Mother fox brought back a vole and two mice, which the kits fought over loudly.",
    "We saw the father fox for the first time this season, near the old oak tree.",
  ];
  load(`<!doctype html><html><head><title>Den watch</title></head><body><main>
    <article><p>Den watch, day 12.</p></article>
    <section>${posts.map((p) => `<p>${p}</p>`).join("")}</section></main></body></html>`);
  const all = text(extractPage());
  for (const post of posts) assert.match(all, new RegExp(post));
});

test("never touches the network, even on sites with special extractors", () => {
  const dom = load(ARTICLE);
  const calls = [];
  const spy = (...args) => { calls.push(args); throw new Error("network used"); };
  const saved = { fetch: globalThis.fetch, XHR: globalThis.XMLHttpRequest };
  globalThis.fetch = dom.window.fetch = spy;
  globalThis.XMLHttpRequest = dom.window.XMLHttpRequest = function () { spy("xhr"); };
  try {
    for (const url of ["https://www.youtube.com/watch?v=abc", "https://x.com/fox/status/1", "https://www.reddit.com/r/foxes/comments/1/x/"]) {
      dom.reconfigure({ url });
      extractPage();
    }
  } finally {
    globalThis.fetch = saved.fetch;
    globalThis.XMLHttpRequest = saved.XHR;
  }
  assert.deepEqual(calls, []);
});

test("does not change the page it reads", () => {
  const dom = load(ARTICLE.replace("</body>", "<script>window.x = 1</script></body>"));
  const before = dom.window.document.documentElement.outerHTML;
  extractPage();
  assert.equal(dom.window.document.documentElement.outerHTML, before);
});
